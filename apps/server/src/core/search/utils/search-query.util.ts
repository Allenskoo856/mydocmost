// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsquery = require('pg-tsquery')();

/** Keep in sync with pages_text_content_trgm_idx migration expression. */
export const SEARCH_TEXT_INDEX_CHARS = 200_000;
export const SEARCH_QUERY_MAX_LENGTH = 64;
export const SEARCH_LIMIT_DEFAULT = 25;
export const SEARCH_LIMIT_MAX = 50;
export const SEARCH_HIGHLIGHT_RADIUS = 40;

/** CJK Unified Ideographs + common adjacent blocks (JP kana, compatibility). */
const CJK_RE =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;

export function hasCjk(text: string): boolean {
  return CJK_RE.test(text);
}

/** Escape ! % _ for PostgreSQL ILIKE using ESCAPE '!'. */
export function escapeIlikePattern(text: string): string {
  return text.replace(/[!%_]/g, (ch) => `!${ch}`);
}

export function unicodeLength(text: string): number {
  return Array.from(text).length;
}

export function clampSearchLimit(limit?: number): number {
  const raw =
    typeof limit === 'number' && Number.isFinite(limit)
      ? Math.floor(limit)
      : SEARCH_LIMIT_DEFAULT;
  if (raw < 1) {
    return SEARCH_LIMIT_DEFAULT;
  }
  return Math.min(raw, SEARCH_LIMIT_MAX);
}

export type PreparedSearchQuery =
  | { ok: false }
  | {
      ok: true;
      query: string;
      ilikePattern: string;
      tsQuery: string | null;
    };

/**
 * Normalize user input for hybrid page search.
 * - CJK: min 1 char; other scripts: min 2 chars
 * - Cap length; escape ILIKE wildcards
 * - Best-effort english FTS query via pg-tsquery (nullable on failure)
 */
export function prepareSearchQuery(
  raw: string | null | undefined,
): PreparedSearchQuery {
  if (raw == null) {
    return { ok: false };
  }

  const query = raw.trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
  if (!query) {
    return { ok: false };
  }

  const minLen = hasCjk(query) ? 1 : 2;
  if (unicodeLength(query) < minLen) {
    return { ok: false };
  }

  const ilikePattern = `%${escapeIlikePattern(query)}%`;

  let tsQuery: string | null = null;
  try {
    const parsed = tsquery(`${query}*`);
    if (typeof parsed === 'string' && parsed.trim().length > 0) {
      tsQuery = parsed;
    }
  } catch {
    tsQuery = null;
  }

  return { ok: true, query, ilikePattern, tsQuery };
}

/**
 * Wrap the first case-insensitive occurrence of query in <mark>.
 * Used when FTS headline is unavailable (typical for CJK ILIKE hits).
 */
export function buildSubstringHighlight(
  text: string | null | undefined,
  query: string,
  radius: number = SEARCH_HIGHLIGHT_RADIUS,
): string {
  if (!text || !query) {
    return '';
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx < 0) {
    return '';
  }

  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snippet = text.slice(start, end);
  const markStart = idx - start;
  const markEnd = markStart + query.length;
  const before = snippet.slice(0, markStart);
  const match = snippet.slice(markStart, markEnd);
  const after = snippet.slice(markEnd);

  snippet = `${before}<mark>${match}</mark>${after}`
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (start > 0) {
    snippet = `...${snippet}`;
  }
  if (end < text.length) {
    snippet = `${snippet}...`;
  }

  return snippet;
}

export function normalizeHighlight(
  highlight: string | null | undefined,
): string {
  if (!highlight) {
    return '';
  }
  return highlight.replace(/\r\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
}
