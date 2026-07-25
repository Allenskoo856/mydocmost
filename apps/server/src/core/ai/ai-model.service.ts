import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EnvironmentService } from '../../integrations/environment/environment.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Thin OpenAI-compatible client (chat + embeddings) built on fetch — no SDK
 * dependency, so it stays offline-friendly. Points at the internal endpoint
 * configured via AI_DRIVER + OPENAI_API_URL / OLLAMA_API_URL.
 */
@Injectable()
export class AiModelService {
  private readonly logger = new Logger(AiModelService.name);

  constructor(private readonly environmentService: EnvironmentService) {}

  isEnabled(): boolean {
    return this.environmentService.isAiEnabled();
  }

  private baseUrl(): string {
    const driver = this.environmentService.getAiDriver();
    let url: string;
    if (driver === 'ollama') {
      url = `${this.environmentService.getOllamaApiUrl()}/v1`;
    } else {
      // openai + any other OpenAI-compatible gateway
      url = this.environmentService.getOpenAiApiUrl();
    }
    if (!url) {
      throw new ServiceUnavailableException('AI endpoint is not configured');
    }
    return url.replace(/\/$/, '');
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const key = this.environmentService.getOpenAiApiKey();
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }
    return headers;
  }

  private timeoutSignal(): { signal: AbortSignal; clear: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.environmentService.getAiRequestTimeoutMs(),
    );
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const { signal, clear } = this.timeoutSignal();
    try {
      const res = await fetch(`${this.baseUrl()}/embeddings`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.environmentService.getAiEmbeddingModel(),
          input: texts,
        }),
        signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`embeddings ${res.status}: ${body.slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        data: { embedding: number[]; index: number }[];
      };
      return json.data
        .slice()
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((d) => d.embedding);
    } finally {
      clear();
    }
  }

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.embed([text]);
    return vector ?? [];
  }

  /**
   * Stream chat completion tokens. Yields incremental content deltas.
   */
  async *chatStream(
    messages: ChatMessage[],
    opts?: { temperature?: number },
  ): AsyncGenerator<string> {
    const { signal, clear } = this.timeoutSignal();
    try {
      const res = await fetch(`${this.baseUrl()}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.environmentService.getAiCompletionModel(),
          messages,
          temperature: opts?.temperature ?? 0.2,
          stream: true,
        }),
        signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        throw new Error(`chat ${res.status}: ${body.slice(0, 300)}`);
      }

      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of res.body as any) {
        buffer += decoder.decode(chunk as Uint8Array, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) yield delta as string;
          } catch {
            // ignore keep-alive / non-JSON lines
          }
        }
      }
    } finally {
      clear();
    }
  }

  async chat(
    messages: ChatMessage[],
    opts?: { temperature?: number },
  ): Promise<string> {
    let out = '';
    for await (const token of this.chatStream(messages, opts)) {
      out += token;
    }
    return out;
  }
}
