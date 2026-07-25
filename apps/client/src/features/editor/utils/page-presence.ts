import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { PagePresenceUser } from "@/features/editor/atoms/editor-atoms";
import { stableUserColor } from "@/features/editor/extensions/utils";

interface AwarenessUserFields {
  id?: string;
  name?: string;
  avatarUrl?: string | null;
  color?: string;
  mode?: string;
}

/**
 * Build a de-duplicated collaborator list from Hocuspocus/Yjs awareness.
 * Multiple tabs from the same user collapse into one entry.
 */
export function collectPagePresence(
  provider: HocuspocusProvider | null | undefined,
  currentUserId?: string,
): PagePresenceUser[] {
  const awareness = provider?.awareness;
  if (!awareness) {
    return [];
  }

  const byUserId = new Map<string, PagePresenceUser>();
  const states =
    typeof awareness.getStates === "function"
      ? awareness.getStates()
      : awareness.states;
  if (!states || typeof states.entries !== "function") {
    return [];
  }

  for (const [clientId, state] of states.entries()) {
    const user = (state?.user || {}) as AwarenessUserFields;
    const userId = user.id || `client:${clientId}`;
    const name = (user.name || "").trim() || "Anonymous";
    const isSelf =
      (currentUserId != null && user.id === currentUserId) ||
      clientId === awareness.clientID;

    const existing = byUserId.get(userId);
    if (existing) {
      // Prefer a state that carries an avatar / real user id.
      if (!existing.avatarUrl && user.avatarUrl) {
        existing.avatarUrl = user.avatarUrl;
      }
      if (!existing.isSelf && isSelf) {
        existing.isSelf = true;
      }
      continue;
    }

    byUserId.set(userId, {
      userId,
      name,
      avatarUrl: user.avatarUrl ?? null,
      color: user.color || stableUserColor(user.id || userId),
      isSelf,
    });
  }

  const users = Array.from(byUserId.values());
  // Self last so others are scanned first; still visible per product choice.
  users.sort((a, b) => {
    if (a.isSelf === b.isSelf) {
      return a.name.localeCompare(b.name);
    }
    return a.isSelf ? 1 : -1;
  });
  return users;
}
