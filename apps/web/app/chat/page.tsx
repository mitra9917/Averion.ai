import { Suspense } from "react";

import { AuthGate } from "@/components/auth-gate";
import { ChatWorkspace } from "@/components/chat-workspace";
import { DashboardShell } from "@/components/dashboard-shell";

export default function ChatPage() {
  return (
    <AuthGate>
      <DashboardShell immersive>
        <Suspense fallback={<p className="px-6 py-8 text-sm text-muted">Loading ask…</p>}>
          <ChatWorkspace />
        </Suspense>
      </DashboardShell>
    </AuthGate>
  );
}
