import { atom, type PrimitiveAtom } from "jotai";
import { Editor } from "@tiptap/core";

// strictNullChecks is disabled in this package, so Jotai's overloads infer a
// read-only atom for `atom<Editor | null>(null)` even though the runtime atom
// is primitive. Keep the writable type explicit for editor instance atoms.
export const pageEditorAtom = atom<Editor | null>(
  null,
) as PrimitiveAtom<Editor | null>;

export const titleEditorAtom = atom<Editor | null>(
  null,
) as PrimitiveAtom<Editor | null>;

export const readOnlyEditorAtom = atom<Editor | null>(
  null,
) as PrimitiveAtom<Editor | null>;

export const yjsConnectionStatusAtom = atom<string>("");

// Set when a user whose default page mode is "read" clicks "Edit" on a page.
// Upgrades the static read view to the full collaborative editor. Reset on
// page switch (FullEditor unmount).
export const pageForceEditAtom = atom<boolean>(false);
