import { AuthGate } from "@/components/auth-gate";
import { DashboardShell } from "@/components/dashboard-shell";
import { InsightsWorkspace } from "@/components/insights-workspace";

export default function InsightsPage() {
  return (
    <AuthGate>
      <DashboardShell>
        <InsightsWorkspace />
      </DashboardShell>
    </AuthGate>
  );
}
