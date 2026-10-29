import { Suspense } from "react";

import { AuthGate } from "@/components/auth-gate";
import { DashboardShell } from "@/components/dashboard-shell";
import { DocumentWorkspace } from "@/components/document-workspace";

export default function DocumentsPage() {
  return (
    <AuthGate>
      <DashboardShell>
        <Suspense fallback={<p className="px-6 py-8 text-sm text-muted">Loading library…</p>}>
          <DocumentWorkspace />
        </Suspense>
      </DashboardShell>
    </AuthGate>
  );
}
