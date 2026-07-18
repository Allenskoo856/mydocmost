import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class McpToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function formatMcpError(code: string, message: unknown): CallToolResult {
  const detail =
    message instanceof Error
      ? message.message
      : typeof message === 'string'
        ? message
        : JSON.stringify(message, null, 2);

  return {
    content: [{ type: 'text', text: `[${code}] ${detail}` }],
    isError: true,
  };
}
