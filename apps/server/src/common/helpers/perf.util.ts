import { FastifyReply } from 'fastify';
import { performance } from 'node:perf_hooks';

export function isPerfDebugEnabled(): boolean {
  return (
    process.env.PERF_DEBUG?.toLowerCase() === 'true' ||
    process.env.DEBUG_MODE?.toLowerCase() === 'true'
  );
}

export async function measureAsync<T>(
  label: string,
  action: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await action();
  const durationMs = performance.now() - start;

  if (isPerfDebugEnabled()) {
    logPerf(label, { ...meta, durationMs: roundPerf(durationMs) });
  }

  return { result, durationMs };
}

export function measureSync<T>(
  label: string,
  action: () => T,
  meta?: Record<string, unknown>,
): { result: T; durationMs: number } {
  const start = performance.now();
  const result = action();
  const durationMs = performance.now() - start;

  if (isPerfDebugEnabled()) {
    logPerf(label, { ...meta, durationMs: roundPerf(durationMs) });
  }

  return { result, durationMs };
}

export function estimatePayloadBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
  } catch {
    return 0;
  }
}

export function appendServerTiming(
  res: FastifyReply,
  metrics: Array<{ name: string; durationMs: number; description?: string }>,
) {
  if (!isPerfDebugEnabled() || metrics.length === 0) return;

  const serverTiming = metrics
    .map((metric) => {
      const parts = [`${metric.name};dur=${roundPerf(metric.durationMs)}`];
      if (metric.description) {
        parts.push(`desc="${metric.description}"`);
      }
      return parts.join(';');
    })
    .join(', ');

  res.header('Server-Timing', serverTiming);
}

export function appendPerfHeader(
  res: FastifyReply,
  key: string,
  value: string | number,
) {
  if (!isPerfDebugEnabled()) return;
  res.header(key, String(value));
}

export function logPerf(label: string, meta?: Record<string, unknown>) {
  if (!isPerfDebugEnabled()) return;
  console.debug(`[perf] ${label}`, meta ?? {});
}

export function roundPerf(value: number): number {
  return Number(value.toFixed(2));
}
