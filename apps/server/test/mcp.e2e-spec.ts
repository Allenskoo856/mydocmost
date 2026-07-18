import { HttpStatus, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

jest.mock('../src/core/mcp/mcp-tools.service', () => ({
  McpToolsService: class McpToolsService {},
}));

import { EnvironmentService } from '../src/integrations/environment/environment.service';
import { McpAuthGuard } from '../src/core/mcp/mcp-auth.guard';
import { McpController } from '../src/core/mcp/mcp.controller';
import { McpServerService } from '../src/core/mcp/mcp-server.service';
import { McpToolsService } from '../src/core/mcp/mcp-tools.service';

describe('MCP endpoint (e2e)', () => {
  const token = 'valid-mcp-token-with-at-least-32-characters';
  let app: NestFastifyApplication;

  const environmentService = {
    getMcpApiToken: jest.fn().mockReturnValue(token),
    getMcpRateLimitRps: jest.fn().mockReturnValue(100),
    getBasePath: jest.fn().mockReturnValue(''),
  };
  const toolsService = {
    getTools: jest.fn().mockReturnValue([
      {
        name: 'list_workspaces',
        description: 'List workspaces',
        inputSchema: { type: 'object', properties: {} },
      },
    ]),
    call: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"workspaces":[]}' }],
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        McpAuthGuard,
        McpServerService,
        { provide: EnvironmentService, useValue: environmentService },
        { provide: McpToolsService, useValue: toolsService },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api', {
      exclude: [{ path: 'mcp/(.*)', method: RequestMethod.ALL }],
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an invalid bearer token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/mcp/sse',
      headers: { authorization: 'Bearer invalid-token' },
    });

    expect(response.statusCode).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('exposes messages outside the API prefix and validates the session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp/messages',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      },
    });

    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(response.body).toBe('Missing sessionId');
  });
});
