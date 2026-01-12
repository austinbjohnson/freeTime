import { AuthGate } from "@/components/auth/AuthGate";
import { Dashboard } from "@/components/dashboard/Dashboard";

export default function HomePage() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
