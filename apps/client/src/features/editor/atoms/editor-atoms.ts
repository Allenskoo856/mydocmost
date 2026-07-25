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

/** Collaborative websocket lifecycle shown in the page header. */
export type CollabConnectionStatus =
  | ""
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "auth_failed";

/**
 * Document sync posture relative to the collab server.
 * - idle: not in a collab editor
 * - synced: fully flushed
 * - saving: connected with outbound changes still in flight
 * - offline_pending: local edits exist while the socket is down
 */
export type CollabSyncStatus =
  | "idle"
  | "synced"
  | "saving"
  | "offline_pending";

export const yjsConnectionStatusAtom = atom<CollabConnectionStatus>("");
export const collabSyncStatusAtom = atom<CollabSyncStatus>("idle");
export const collabReconnectAttemptAtom = atom(0);
/** Increment to request an immediate collab reconnect from PageEditor. */
export const collabRetryRequestAtom = atom(0);

// Set when a user whose default page mode is "read" clicks "Edit" on a page.
// Upgrades the static read view to the full collaborative editor. Reset on
// page switch (FullEditor unmount).
export const pageForceEditAtom = atom<boolean>(false);

/** One collaborator currently present on the open collaborative page. */
export interface PagePresenceUser {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  color: string;
  isSelf: boolean;
}

/** Active editors on the current page (from Yjs awareness). Empty when not editing. */
export const pagePresenceAtom = atom<PagePresenceUser[]>([]);
