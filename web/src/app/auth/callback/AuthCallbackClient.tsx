"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  clearAuthState,
  exchangeWorkosCode,
  getStoredState,
  storeSession,
} from "@/lib/workosAuth";

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
      setMessage("Missing authorization code. Please try logging in again.");
      return;
    }

    const expectedState = getStoredState();
    if (expectedState && state !== expectedState) {
      setMessage("Login state mismatch. Please try again.");
      clearAuthState();
      return;
    }

    exchangeWorkosCode(code)
      .then(({ accessToken, refreshToken, user }) => {
        storeSession({ accessToken, refreshToken, user });
        clearAuthState();
        router.replace("/");
      })
      .catch((error) => {
        console.error("WorkOS callback failed", error);
        setMessage("Login failed. Please try again.");
      });
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-app">
      <div className="surface-card rounded-2xl p-8 text-sm text-white/70 shadow-glow">
        {message}
      </div>
    </div>
  );
}
