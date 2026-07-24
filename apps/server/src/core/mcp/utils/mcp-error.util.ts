import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class McpToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly retryable = false,
    readonly suggestedAction?: string,
  ) {
    super(message);
  }
}

export function formatMcpError(code: string, message: unknown): CallToolResult {
  return formatMcpToolError(
    new McpToolError(
      code,
      message instanceof Error
        ? message.message
        : typeof message === 'string'
          ? message
          : JSON.stringify(message, null, 2),
    ),
  );
}

export function formatMcpToolError(error: McpToolError): CallToolResult {
  const detail =
    error.message ||
    (typeof error.details === 'object' ? JSON.stringify(error.details) : '');
  const structuredContent = {
    error: {
      code: error.code,
      message: detail,
      retryable: error.retryable,
      details: error.details,
      ...(error.suggestedAction
        ? { suggestedAction: error.suggestedAction }
        : {}),
    },
  };

  return {
    content: [{ type: 'text', text: `[${error.code}] ${detail}` }],
    structuredContent,
    isError: true,
  };
}
