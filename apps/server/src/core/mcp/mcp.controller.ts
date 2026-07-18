import {
  Controller,
  Get,
  HttpStatus,
  Logger,
  OnModuleDestroy,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { getMcpControllerPath } from './mcp-path.util';
import { McpServerService } from './mcp-server.service';

interface McpSession {
  server: Server;
  transport: SSEServerTransport;
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
  private readonly sessions = new Map<string, McpSession>();
  private readonly requestCounts = new Map<string, RateLimitWindow>();

  constructor(
    private readonly mcpServerService: McpServerService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @Get('sse')
  @SkipTransform()
  async sse(
    @Req() _request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const endpoint = `${this.environmentService.getBasePath()}/mcp/messages`;
    const transport = new SSEServerTransport(endpoint, reply.raw);
    const server = this.mcpServerService.createServer();
    const sessionId = transport.sessionId;

    transport.onclose = () => this.removeSession(sessionId);
    transport.onerror = (error) => {
      this.logger.error(`MCP session ${sessionId} transport error`, error);
      this.removeSession(sessionId);
    };

    this.sessions.set(sessionId, {
      server,
      transport,
      idleTimer: this.createIdleTimer(sessionId),
    });

    try {
      await server.connect(transport);
      this.logger.log(`MCP session ${sessionId} connected`);
    } catch (error) {
      this.removeSession(sessionId);
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

    const session = this.sessions.get(sessionId);
    if (!session) {
      reply.status(HttpStatus.NOT_FOUND).send('Session not found');
      return;
    }

    if (!this.consumeRateLimit(sessionId)) {
      reply.status(HttpStatus.TOO_MANY_REQUESTS).send({
        jsonrpc: '2.0',
        error: { code: -32000, message: '[RATE_LIMITED] Too many requests' },
        id: null,
      });
      return;
    }

    this.touchSession(sessionId, session);
    await session.transport.handlePostMessage(
      request.raw,
      reply.raw,
      request.body,
    );
  }

  async onModuleDestroy(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    this.requestCounts.clear();

    await Promise.allSettled(
      sessions.map(async ({ idleTimer, server }) => {
        clearTimeout(idleTimer);
        await server.close();
      }),
    );
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

  private touchSession(sessionId: string, session: McpSession): void {
    clearTimeout(session.idleTimer);
    session.idleTimer = this.createIdleTimer(sessionId);
  }

  private createIdleTimer(sessionId: string): NodeJS.Timeout {
    return setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (!session) return;

      this.logger.log(`MCP session ${sessionId} closed after idle timeout`);
      void session.server.close();
      this.removeSession(sessionId);
    }, SESSION_IDLE_TIMEOUT_MS).unref();
  }

  private removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    clearTimeout(session.idleTimer);
    this.sessions.delete(sessionId);
    this.requestCounts.delete(sessionId);
    this.logger.log(`MCP session ${sessionId} closed`);
  }
}
