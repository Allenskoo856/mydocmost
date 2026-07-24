import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { McpController } from './mcp.controller';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpServerService } from './mcp-server.service';
import { McpSessionStateService } from './mcp-session-state.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';

const TOKEN = 'valid-token-32-chars-long-minimum';

describe('McpController transports', () => {
  let app: NestFastifyApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const toolsService = {
      getTools: jest.fn().mockReturnValue([
        {
          name: 'example_tool',
          description: 'Example',
          inputSchema: { type: 'object', properties: {} },
        },
      ]),
      call: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"ok":true}' }],
        structuredContent: { ok: true },
      }),
    };
    const serverService = new McpServerService(
      toolsService as never,
      new McpSessionStateService(),
    );
    const environmentService = {
      getMcpApiToken: jest.fn().mockReturnValue(TOKEN),
      getMcpAllowedOrigins: jest.fn().mockReturnValue(['http://127.0.0.1']),
      getMcpMaxSessions: jest.fn().mockReturnValue(1),
      getMcpRateLimitRps: jest.fn().mockReturnValue(10),
      getBasePath: jest.fn().mockReturnValue(''),
      getAppUrl: jest.fn().mockReturnValue('http://127.0.0.1'),
    };

    const module = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        { provide: McpServerService, useValue: serverService },
        { provide: EnvironmentService, useValue: environmentService },
        McpAuthGuard,
      ],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('supports Streamable HTTP initialize, tools/list, tools/call, and DELETE', async () => {
    const client = new Client({
      name: 'streamable-test-client',
      version: '1.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/mcp`),
      { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } },
    );

    await client.connect(transport);
    await expect(client.listTools()).resolves.toMatchObject({
      tools: [{ name: 'example_tool' }],
    });
    await expect(
      client.callTool({ name: 'example_tool', arguments: {} }),
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: '{"ok":true}' }],
    });

    await transport.terminateSession();
    await client.close();
  });

  it('rejects a Streamable HTTP request without a session', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status).toBe(400);
  });

  it('releases a rejected initialization before enforcing the session limit', async () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      const rejected = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'rejected-client', version: '1.0.0' },
          },
        }),
      });
      expect(rejected.status).toBe(406);

      const client = new Client({ name: 'retry-client', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(
        new URL(`${baseUrl}/mcp`),
        { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } },
      );
      await expect(client.connect(transport)).resolves.toBeUndefined();
      await transport.terminateSession();
      await client.close();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('keeps the legacy SSE endpoint available', async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/mcp/sse`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    controller.abort();
  });
});
