import { Suspense } from "react";
import { AuthCallbackClient } from "./AuthCallbackClient";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-app">
          <div className="surface-card rounded-2xl p-8 text-sm text-white/70 shadow-glow">
            Signing you in…
          </div>
        </div>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
