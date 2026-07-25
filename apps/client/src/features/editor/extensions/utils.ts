export const userColors = [
  "#958DF1",
  "#F98181",
  "#FBBC88",
  "#FAF594",
  "#70CFF8",
  "#94FADB",
  "#B9F18D",
];

export function randomElement(array: Array<any>) {
  return array[Math.floor(Math.random() * array.length)];
}

/** Stable collab color so the same user keeps the same caret/avatar ring. */
export function stableUserColor(userId: string | undefined | null): string {
  if (!userId) {
    return userColors[0];
  }
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return userColors[hash % userColors.length];
}
