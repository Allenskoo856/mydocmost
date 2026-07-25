import { IPage } from "@/features/page/types/page.types";

export interface AgentPageContextInput {
  page?: Pick<
    IPage,
    | "id"
    | "slugId"
    | "title"
    | "spaceId"
    | "workspaceId"
    | "parentPageId"
    | "updatedAt"
  > | null;
  spaceSlug?: string;
  pageUrl?: string;
  selectedText?: string;
}

/**
 * Build a compact, copy-paste friendly payload for external Agents / MCP clients.
 * Keep field names stable so prompts and tools can rely on them.
 */
export function buildAgentPageContext(input: AgentPageContextInput): string {
  const page = input.page;
  const payload = {
    pageId: page?.id ?? null,
    slugId: page?.slugId ?? null,
    title: page?.title || "Untitled",
    spaceId: page?.spaceId ?? null,
    spaceSlug: input.spaceSlug ?? null,
    workspaceId: page?.workspaceId ?? null,
    parentPageId: page?.parentPageId ?? null,
    updatedAt: page?.updatedAt ?? null,
    pageUrl: input.pageUrl ?? null,
    selectedText: input.selectedText?.trim() || null,
    hints: {
      preferredIdField: "pageId",
      note: "Use pageId/spaceId with Docmost MCP tools. Call get_context then get_page/search_pages as needed.",
    },
  };

  return [
    "Docmost Agent Context",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  ].join("\n");
}

export function getSelectedEditorText(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const selection = window.getSelection();
  return selection?.toString() ?? "";
}
