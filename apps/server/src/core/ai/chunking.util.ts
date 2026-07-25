export interface TextChunk {
  index: number;
  start: number;
  length: number;
  text: string;
}

const MAX_CHUNKS = 400;

/**
 * Split plain page text into overlapping chunks for embedding. Tries to break
 * on a sentence / newline boundary near the window end for cleaner chunks.
 * Offsets are into the passed-in string (page.text_content).
 */
export function chunkText(
  text: string,
  chunkSize: number,
  overlap: number,
): TextChunk[] {
  const chunks: TextChunk[] = [];
  const clean = text ?? '';
  if (!clean.trim()) return chunks;

  let start = 0;
  while (start < clean.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(clean.length, start + chunkSize);

    if (end < clean.length) {
      const window = clean.slice(start, end);
      const breakAt = Math.max(
        window.lastIndexOf('\n'),
        window.lastIndexOf('。'),
        window.lastIndexOf('. '),
      );
      if (breakAt > chunkSize * 0.5) {
        end = start + breakAt + 1;
      }
    }

    const piece = clean.slice(start, end).trim();
    if (piece) {
      chunks.push({
        index: chunks.length,
        start,
        length: end - start,
        text: piece,
      });
    }

    if (end >= clean.length) break;
    const nextStart = end - overlap;
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}
