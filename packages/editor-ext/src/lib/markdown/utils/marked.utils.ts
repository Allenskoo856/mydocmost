import { marked } from "marked";
import { calloutExtension } from "./callout.marked";
import { mathBlockExtension } from "./math-block.marked";
import { mathInlineExtension } from "./math-inline.marked";

marked.use({
  renderer: {
    // @ts-ignore
    list(body: string, isOrdered: boolean, start: number) {
      if (isOrdered) {
        const startAttr = start !== 1 ? ` start="${start}"` : "";
        return `<ol ${startAttr}>\n${body}</ol>\n`;
      }

      const dataType = body.includes(`<input`) ? ' data-type="taskList"' : "";
      return `<ul${dataType}>\n${body}</ul>\n`;
    },
    // @ts-ignore
    listitem({ text, raw, task: isTask, checked: isChecked }): string {
      if (!isTask) {
        return `<li>${text}</li>\n`;
      }
      const checkedAttr = isChecked
        ? 'data-checked="true"'
        : 'data-checked="false"';
      return `<li data-type="taskItem" ${checkedAttr}>${text}</li>\n`;
    },
  },
});

marked.use({
  extensions: [calloutExtension, mathBlockExtension, mathInlineExtension],
});

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * 检测可能导致堆栈溢出的模式
 */
function hasProblematicPatterns(markdown: string): boolean {
  // 检查过深的嵌套列表（超过10层）
  const deepNestingPattern = /^\s{40,}/m; // 40个空格 = 10层嵌套
  if (deepNestingPattern.test(markdown)) {
    return true;
  }

  // 检查过长的连续行（超过50KB）
  const lines = markdown.split('\n');
  if (lines.some((line) => line.length > 50000)) {
    return true;
  }

  // 检查特殊字符重复过多（可能导致正则表达式回溯）
  const specialCharPatterns = [
    /[*_-]{1000,}/, // 大量星号、下划线或连字符
    /\[.*?\]{100,}/, // 大量方括号
    /\(.*?\){100,}/, // 大量括号
  ];

  return specialCharPatterns.some((pattern) => pattern.test(markdown));
}

export function markdownToHtml(
  markdownInput: string,
): string | Promise<string> {
  const YAML_FONT_MATTER_REGEX = /^\s*---[\s\S]*?---\s*/;
  
  // 文件大小限制：避免处理超大文件导致内存溢出
  const MAX_MARKDOWN_SIZE = 2 * 1024 * 1024; // 2MB
  if (markdownInput.length > MAX_MARKDOWN_SIZE) {
    console.warn(
      `Markdown file size (${markdownInput.length}) exceeds limit (${MAX_MARKDOWN_SIZE}). Using plain text conversion.`
    );
    return `<pre>${escapeHtml(markdownInput.substring(0, MAX_MARKDOWN_SIZE))}</pre>`;
  }

  const markdown = markdownInput
    .replace(YAML_FONT_MATTER_REGEX, "")
    .trimStart();

  // 检查可能导致问题的模式
  if (hasProblematicPatterns(markdown)) {
    console.warn('Markdown contains potentially problematic patterns. Using plain text conversion.');
    return `<pre>${escapeHtml(markdown)}</pre>`;
  }

  // 使用 Promise 包装并添加超时保护
  return Promise.race([
    new Promise<string>((resolve, reject) => {
      try {
        const result = marked
          .options({ breaks: true })
          .parse(markdown)
          .toString();
        resolve(result);
      } catch (error: any) {
        reject(error);
      }
    }),
    new Promise<string>((resolve) => {
      setTimeout(() => {
        console.warn('Markdown parsing timeout. Using plain text conversion.');
        resolve(`<pre>${escapeHtml(markdown)}</pre>`);
      }, 2000); // 2秒超时
    }),
  ]).catch((error: any) => {
    console.error(
      `Error parsing markdown: ${error?.message}. Falling back to plain text.`
    );
    return `<pre>${escapeHtml(markdown)}</pre>`;
  });
}
