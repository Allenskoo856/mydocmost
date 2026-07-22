import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  OnModuleDestroy,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { getMcpControllerPath } from './mcp-path.util';
import { McpServerService } from './mcp-server.service';

interface McpSession<TTransport> {
  server: Server;
  transport: TTransport;
  idleTimer: NodeJS.Timeout;
}

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

@SkipTransform()
@UseGuards(McpAuthGuard)
@Controller(getMcpControllerPath())
export class McpController implements OnModuleDestroy {
  private readonly logger = new Logger(McpController.name);
  private readonly legacySessions = new Map<
    string,
    McpSession<SSEServerTransport>
  >();
  private readonly streamableSessions = new Map<
    string,
    McpSession<StreamableHTTPServerTransport>
  >();
  private readonly pendingStreamableSessions = new Set<
    McpSession<StreamableHTTPServerTransport>
  >();
  private readonly requestCounts = new Map<string, RateLimitWindow>();

  constructor(
    private readonly mcpServerService: McpServerService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @Post()
  @SkipTransform()
  async streamablePost(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.handleStreamableRequest(request, reply);
  }

  @Get()
  @SkipTransform()
  async streamableGet(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.handleStreamableRequest(request, reply);
  }

  @Delete()
  @SkipTransform()
  async streamableDelete(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.handleStreamableRequest(request, reply);
  }

  @Get('sse')
  @SkipTransform()
  async sse(
    @Req() _request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!this.hasSessionCapacity()) {
      reply
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .send('MCP session limit reached');
      return;
    }

    const endpoint = `${this.environmentService.getBasePath()}/mcp/messages`;
    const transport = new SSEServerTransport(endpoint, reply.raw);
    const server = this.mcpServerService.createServer();
    const sessionId = transport.sessionId;

    transport.onclose = () => this.removeLegacySession(sessionId);
    transport.onerror = (error) => {
      this.logger.error(
        `MCP legacy session ${sessionId} transport error`,
        error,
      );
      this.removeLegacySession(sessionId);
    };

    this.legacySessions.set(sessionId, {
      server,
      transport,
      idleTimer: this.createIdleTimer('legacy', sessionId),
    });

    try {
      await server.connect(transport);
      this.logger.log(`MCP legacy session ${sessionId} connected`);
    } catch (error) {
      this.removeLegacySession(sessionId);
      throw error;
    }
  }

  @Post('messages')
  @SkipTransform()
  async messages(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { sessionId } = request.query as { sessionId?: string };
    if (!sessionId) {
      reply.status(HttpStatus.BAD_REQUEST).send('Missing sessionId');
      return;
    }

    const session = this.legacySessions.get(sessionId);
    if (!session) {
      reply.status(HttpStatus.NOT_FOUND).send('Session not found');
      return;
    }

    if (!this.consumeRateLimit(sessionId)) {
      this.sendRateLimitError(reply);
      return;
    }

    this.touchSession('legacy', sessionId, session);
    await session.transport.handlePostMessage(
      request.raw,
      reply.raw,
      request.body,
    );
  }

  async onModuleDestroy(): Promise<void> {
    const sessions = [
      ...this.legacySessions.values(),
      ...this.streamableSessions.values(),
      ...this.pendingStreamableSessions.values(),
    ];
    this.legacySessions.clear();
    this.streamableSessions.clear();
    this.pendingStreamableSessions.clear();
    this.requestCounts.clear();

    await Promise.allSettled(
      sessions.map(async ({ idleTimer, server }) => {
        clearTimeout(idleTimer);
        await server.close();
      }),
    );
  }

  private async handleStreamableRequest(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const requestedSessionId = this.readHeader(
      request.headers['mcp-session-id'],
    );
    let session = requestedSessionId
      ? this.streamableSessions.get(requestedSessionId)
      : undefined;
    let createdSession = false;

    if (requestedSessionId && !session) {
      this.sendJsonRpcError(
        reply,
        HttpStatus.NOT_FOUND,
        -32001,
        'Session not found',
      );
      return;
    }

    if (!session) {
      if (request.method !== 'POST' || !isInitializeRequest(request.body)) {
        this.sendJsonRpcError(
          reply,
          HttpStatus.BAD_REQUEST,
          -32000,
          'No valid session ID provided',
        );
        return;
      }

      if (!this.hasSessionCapacity()) {
        this.sendJsonRpcError(
          reply,
          HttpStatus.SERVICE_UNAVAILABLE,
          -32000,
          'MCP session limit reached',
        );
        return;
      }

      session = await this.createStreamableSession();
      createdSession = true;
    } else {
      if (!this.consumeRateLimit(requestedSessionId)) {
        this.sendRateLimitError(reply);
        return;
      }
      this.touchSession('streamable', requestedSessionId, session);
    }

    try {
      await session.transport.handleRequest(
        request.raw,
        reply.raw,
        request.body,
      );

      const initializedSessionId = session.transport.sessionId;
      if (initializedSessionId) {
        const initializedSession =
          this.streamableSessions.get(initializedSessionId);
        if (initializedSession) {
          this.touchSession(
            'streamable',
            initializedSessionId,
            initializedSession,
          );
        }
      } else if (createdSession) {
        await this.closePendingStreamableSession(session);
      }
    } catch (error) {
      if (createdSession) {
        await this.closePendingStreamableSession(session);
      }
      this.logger.error('MCP Streamable HTTP request failed', error);
      if (!reply.raw.headersSent) {
        this.sendJsonRpcError(
          reply,
          HttpStatus.INTERNAL_SERVER_ERROR,
          -32603,
          'Internal server error',
        );
      }
    }
  }

  private async createStreamableSession(): Promise<
    McpSession<StreamableHTTPServerTransport>
  > {
    const server = this.mcpServerService.createServer();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        clearTimeout(session.idleTimer);
        this.pendingStreamableSessions.delete(session);
        session.idleTimer = this.createIdleTimer('streamable', sessionId);
        this.streamableSessions.set(sessionId, session);
        this.logger.log(`MCP Streamable HTTP session ${sessionId} connected`);
      },
      onsessionclosed: (sessionId) => {
        this.removeStreamableSession(sessionId);
      },
    });

    const session: McpSession<StreamableHTTPServerTransport> = {
      server,
      transport,
      idleTimer: setTimeout(() => {
        void this.closePendingStreamableSession(session);
      }, SESSION_IDLE_TIMEOUT_MS).unref(),
    };

    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId) this.removeStreamableSession(sessionId);
    };
    transport.onerror = (error) => {
      this.logger.error('MCP Streamable HTTP transport error', error);
    };

    await server.connect(transport);
    this.pendingStreamableSessions.add(session);
    return session;
  }

  private consumeRateLimit(sessionId: string): boolean {
    const now = Date.now();
    const limit = Math.max(1, this.environmentService.getMcpRateLimitRps());
    const current = this.requestCounts.get(sessionId);

    if (!current || current.resetAt <= now) {
      this.requestCounts.set(sessionId, { count: 1, resetAt: now + 1000 });
      return true;
    }

    if (current.count >= limit) {
      return false;
    }

    current.count += 1;
    return true;
  }

  private hasSessionCapacity(): boolean {
    return (
      this.legacySessions.size +
        this.streamableSessions.size +
        this.pendingStreamableSessions.size <
      this.environmentService.getMcpMaxSessions()
    );
  }

  private touchSession<TTransport>(
    kind: 'legacy' | 'streamable',
    sessionId: string,
    session: McpSession<TTransport>,
  ): void {
    clearTimeout(session.idleTimer);
    session.idleTimer = this.createIdleTimer(kind, sessionId);
  }

  private createIdleTimer(
    kind: 'legacy' | 'streamable',
    sessionId: string,
  ): NodeJS.Timeout {
    return setTimeout(() => {
      if (kind === 'legacy') {
        const session = this.legacySessions.get(sessionId);
        if (!session) return;
        void session.server.close();
        this.removeLegacySession(sessionId);
      } else {
        const session = this.streamableSessions.get(sessionId);
        if (!session) return;
        this.closeStreamableSession(sessionId);
      }
      this.logger.log(
        `MCP ${kind} session ${sessionId} closed after idle timeout`,
      );
    }, SESSION_IDLE_TIMEOUT_MS).unref();
  }

  private removeLegacySession(sessionId: string): void {
    const session = this.legacySessions.get(sessionId);
    if (!session) return;

    clearTimeout(session.idleTimer);
    this.legacySessions.delete(sessionId);
    this.requestCounts.delete(sessionId);
    this.logger.log(`MCP legacy session ${sessionId} closed`);
  }

  private removeStreamableSession(sessionId: string): void {
    const session = this.streamableSessions.get(sessionId);
    if (!session) return;

    clearTimeout(session.idleTimer);
    this.streamableSessions.delete(sessionId);
    this.requestCounts.delete(sessionId);
    this.logger.log(`MCP Streamable HTTP session ${sessionId} closed`);
  }

  private closeStreamableSession(sessionId: string): void {
    const session = this.streamableSessions.get(sessionId);
    if (!session) return;
    this.removeStreamableSession(sessionId);
    void session.server.close();
  }

  private async closePendingStreamableSession(
    session: McpSession<StreamableHTTPServerTransport>,
  ): Promise<void> {
    if (!this.pendingStreamableSessions.delete(session)) return;
    clearTimeout(session.idleTimer);
    await session.server.close();
  }

  private sendRateLimitError(reply: FastifyReply): void {
    this.sendJsonRpcError(
      reply,
      HttpStatus.TOO_MANY_REQUESTS,
      -32000,
      '[RATE_LIMITED] Too many requests',
    );
  }

  private sendJsonRpcError(
    reply: FastifyReply,
    status: number,
    code: number,
    message: string,
  ): void {
    reply.status(status).send({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    });
  }

  private readHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
