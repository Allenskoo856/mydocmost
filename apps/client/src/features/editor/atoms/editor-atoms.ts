import { atom } from "jotai";
import { Editor } from "@tiptap/core";

export const pageEditorAtom = atom<Editor | null>(null);

export const titleEditorAtom = atom<Editor | null>(null);

export const readOnlyEditorAtom = atom<Editor | null>(null);

export const yjsConnectionStatusAtom = atom<string>("");

// Set when a user whose default page mode is "read" clicks "Edit" on a page.
// Upgrades the static read view to the full collaborative editor. Reset on
// page switch (FullEditor unmount).
export const pageForceEditAtom = atom<boolean>(false);
