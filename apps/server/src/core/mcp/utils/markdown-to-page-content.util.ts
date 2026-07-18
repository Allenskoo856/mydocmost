import { markdownToHtml } from '@docmost/editor-ext';
import { createYdocFromJson } from '../../../common/helpers/prosemirror/utils';
import {
  htmlToJson,
  jsonToText,
} from '../../../collaboration/collaboration.util';
import { McpToolError } from './mcp-error.util';

export interface McpPageContent {
  title?: string;
  content: any;
  textContent: string;
  ydoc: Buffer | null;
}

export async function markdownToPageContent(
  markdown: string,
): Promise<McpPageContent> {
  try {
    const html = await markdownToHtml(markdown);
    const prosemirrorJson = await htmlToJson(html);
    const nodes = prosemirrorJson.content ?? [];
    let title: string | undefined;

    if (nodes[0]?.type === 'heading' && nodes[0]?.attrs?.level === 1) {
      title = nodes[0].content?.map((node: any) => node.text ?? '').join('');
      nodes.shift();
    }

    if (nodes.length === 0) {
      nodes.push({ type: 'paragraph', content: [] });
    }

    const content = { ...prosemirrorJson, content: nodes };
    return {
      title: title || undefined,
      content,
      textContent: jsonToText(content),
      ydoc: createYdocFromJson(content),
    };
  } catch (error) {
    if (error instanceof McpToolError) throw error;
    throw new McpToolError('INVALID_MARKDOWN', 'Unable to parse Markdown');
  }
}
