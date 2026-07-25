import type { ReactNode } from "react";

export type CommandGroupId = "page" | "navigation" | "agent";

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  group: CommandGroupId;
  shortcut?: string;
  /** When false, command is hidden from the palette. */
  enabled?: boolean;
  perform: () => void | Promise<void>;
  icon?: ReactNode;
}
