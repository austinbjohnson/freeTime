"use client";

import { useAuth } from "@/components/auth/AuthProvider";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, convexUserId, isReady, isSyncing, login } = useAuth();

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <div className="surface-card rounded-2xl p-8 text-sm text-white/70 shadow-glow">
          Loading portal…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-app">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6">
          <div className="surface-card w-full max-w-xl rounded-3xl p-10 shadow-glow animate-rise">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">
              Free Time Portal
            </p>
            <h1 className="mt-4 font-display text-4xl text-white">
              Turn intake into confident pricing.
            </h1>
            <p className="mt-4 text-base text-white/70">
              Upload tag, garment, and condition photos. We’ll run the full
              pricing pipeline and keep the scan list updated in real time.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <button className="btn-primary" onClick={login}>
                Continue with Google or Apple
              </button>
              <p className="text-xs text-white/50">
                Login is powered by WorkOS AuthKit.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!convexUserId || isSyncing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <div className="surface-card rounded-2xl p-8 text-sm text-white/70 shadow-glow">
          Setting up your account…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
