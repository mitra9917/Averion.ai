"use client";

import { createContext, useContext, type ReactNode } from "react";

export type WorkspaceChrome = {
  orgName: string;
  userName: string;
  userInitials: string;
  orgInitials: string;
  role: string | null;
  email: string | null;
  avatarUrl: string | null;
  openSearch: () => void;
  setTrail: (trail: string | null) => void;
};

const fallback: WorkspaceChrome = {
  orgName: "Workspace",
  userName: "there",
  userInitials: "A",
  orgInitials: "A",
  role: null,
  email: null,
  avatarUrl: null,
  openSearch: () => undefined,
  setTrail: () => undefined
};

const WorkspaceContext = createContext<WorkspaceChrome>(fallback);

export function WorkspaceProvider({
  value,
  children
}: {
  value: WorkspaceChrome;
  children: ReactNode;
}) {
  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
