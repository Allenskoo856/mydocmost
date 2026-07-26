import { atom } from "jotai";

// Session-only inheritance suggestion for a freshly created child page. It is
// never persisted to the backend and is cleared when the page is left,
// refreshed, adopted, or ignored. Keyed by the new page id.
export interface PagePropertyInheritanceSuggestion {
  pageId: string;
  parentPageId: string;
  ownerId?: string;
  ownerName?: string;
  tags: string[];
}

export const pageInheritanceSuggestionsAtom = atom<
  Record<string, PagePropertyInheritanceSuggestion>
>({});
