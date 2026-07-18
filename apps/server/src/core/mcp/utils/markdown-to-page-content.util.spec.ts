const markdownToHtml = jest.fn(async (markdown: string) => markdown);
const htmlToJson = jest.fn(async (html: string) =>
  html
    ? {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Page title' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Body text' }],
          },
        ],
      }
    : { type: 'doc', content: [] },
);

jest.mock('@docmost/editor-ext', () => ({
  markdownToHtml: (markdown: string) => markdownToHtml(markdown),
}));
jest.mock('../../../collaboration/collaboration.util', () => ({
  htmlToJson: (html: string) => htmlToJson(html),
  jsonToText: (content: {
    content: Array<{ content?: Array<{ text: string }> }>;
  }) =>
    content.content
      .flatMap((node) => node.content ?? [])
      .map((node) => node.text)
      .join(''),
}));
jest.mock('../../../common/helpers/prosemirror/utils', () => ({
  createYdocFromJson: () => Buffer.from('ydoc'),
}));

import { markdownToPageContent } from './markdown-to-page-content.util';

describe('markdownToPageContent', () => {
  it('extracts the leading level-one heading and builds page content', async () => {
    const result = await markdownToPageContent('# Page title\n\nBody text');

    expect(result.title).toBe('Page title');
    expect(result.content.type).toBe('doc');
    expect(result.content.content[0].type).not.toBe('heading');
    expect(result.textContent).toContain('Body text');
    expect(Buffer.isBuffer(result.ydoc)).toBe(true);
  });

  it('keeps an empty document valid', async () => {
    const result = await markdownToPageContent('');

    expect(result.title).toBeUndefined();
    expect(result.content.content).toHaveLength(1);
    expect(result.content.content[0].type).toBe('paragraph');
  });
});
