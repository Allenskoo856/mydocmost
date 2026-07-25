export interface AiCitation {
  n: number;
  pageId: string;
  title: string;
  slugId: string;
  spaceSlug: string;
  icon: string | null;
}

export type AiAskScope = "workspace" | "space" | "page";

export type AiStreamEvent =
  | { type: "citations"; items: AiCitation[] }
  | { type: "token"; value: string }
  | { type: "done" }
  | { type: "error"; message: string };
