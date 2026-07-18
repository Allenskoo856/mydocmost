import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

jest.mock('./mcp-tools.service', () => ({
  McpToolsService: class McpToolsService {},
}));

import { McpServerService } from './mcp-server.service';
import type { McpToolsService } from './mcp-tools.service';

describe('McpServerService', () => {
  it('serves tool discovery and calls through the MCP protocol', async () => {
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
      }),
    } as unknown as McpToolsService;
    const service = new McpServerService(toolsService);
    const server = service.createServer();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    await expect(client.listTools()).resolves.toMatchObject({
      tools: [{ name: 'example_tool' }],
    });
    await expect(
      client.callTool({ name: 'example_tool', arguments: { value: 1 } }),
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: '{"ok":true}' }],
    });
    expect(toolsService.call).toHaveBeenCalledWith('example_tool', {
      value: 1,
    });

    await client.close();
    await server.close();
  });
});
