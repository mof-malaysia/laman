import { createContext, useContext } from "react";

export type ShellActions = {
  /** Starts the new page flow, under `parentId` when given. */
  newPage: (parentId?: string) => void;
  /** Opens the "Open page" palette. */
  openPage: () => void;
  /** Opens the upload dialog, uploading `files` straight away when given. */
  uploadMedia: (files?: File[]) => void;
};

export const ShellContext = createContext<ShellActions | null>(null);

export function useShell(): ShellActions {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used inside the admin shell");
  return shell;
}
