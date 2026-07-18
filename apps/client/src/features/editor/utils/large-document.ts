export const LARGE_DOCUMENT_JSON_SIZE = 300_000;

export function isLargeDocumentSize(contentSize?: number): boolean {
  return (
    typeof contentSize === "number" && contentSize > LARGE_DOCUMENT_JSON_SIZE
  );
}

export function isLargeDocumentContent(content: unknown): boolean {
  if (!content) return false;

  if (typeof content === "string") {
    return content.length > LARGE_DOCUMENT_JSON_SIZE;
  }

  try {
    return JSON.stringify(content).length > LARGE_DOCUMENT_JSON_SIZE;
  } catch {
    return false;
  }
}
