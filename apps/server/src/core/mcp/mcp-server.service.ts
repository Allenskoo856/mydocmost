import { Injectable } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpSessionStateService } from './mcp-session-state.service';
import { McpToolsService } from './mcp-tools.service';

@Injectable()
export class McpServerService {
  constructor(
    private readonly toolsService: McpToolsService,
    private readonly sessionStateService: McpSessionStateService,
  ) {}

  createServer(): Server {
    const sessionContext = this.sessionStateService.createSessionContext();
    const server = new Server(
      { name: 'docmost-mcp-server', version: '1.2.0' },
      {
        capabilities: { tools: {} },
        instructions:
          'Call get_context first to bind a workspace to this MCP session. In a single-workspace deployment, workspaceId may be omitted. Prefer get_page for full page context, and use plan_page_changes + apply_page_changes for batch edits.',
      },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.toolsService.getTools(),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) =>
      this.toolsService.call(
        request.params.name,
        request.params.arguments ?? {},
        sessionContext,
      ),
    );

    return server;
  }
}
