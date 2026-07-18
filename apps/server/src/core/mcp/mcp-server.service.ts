import { Injectable } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpToolsService } from './mcp-tools.service';

@Injectable()
export class McpServerService {
  constructor(private readonly toolsService: McpToolsService) {}

  createServer(): Server {
    const server = new Server(
      { name: 'docmost-mcp-server', version: '1.0.0' },
      {
        capabilities: { tools: {} },
        instructions:
          'Use list_workspaces first, then pass workspaceId to all workspace-scoped tools.',
      },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.toolsService.getTools(),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) =>
      this.toolsService.call(
        request.params.name,
        request.params.arguments ?? {},
      ),
    );

    return server;
  }
}
