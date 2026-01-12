"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convexApi";
import type { UserId } from "@/lib/convexTypes";
import {
  clearSession,
  getStoredSession,
  startWorkosLogin,
  storeSession,
  type WorkOSUser,
} from "@/lib/workosAuth";

type AuthContextValue = {
  user: WorkOSUser | null;
  convexUserId: UserId | null;
  isReady: boolean;
  isSyncing: boolean;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<WorkOSUser | null>(null);
  const [convexUserId, setConvexUserId] = useState<UserId | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncUser = useMutation(api.users.getOrCreateUser);

  useEffect(() => {
    const session = getStoredSession();
    setUser(session?.user ?? null);
    setConvexUserId((session?.convexUserId as UserId) ?? null);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!user || convexUserId || !isReady) {
      return;
    }
    let isActive = true;
    setIsSyncing(true);
    syncUser({
      workosId: user.id,
      email: user.email,
      firstName: user.first_name ?? undefined,
      lastName: user.last_name ?? undefined,
      avatarUrl: user.profile_picture_url ?? undefined,
    })
      .then((id) => {
        if (!isActive) {
          return;
        }
        const convexId = id as UserId;
        setConvexUserId(convexId);
        storeSession({ convexUserId: convexId });
      })
      .catch((error) => {
        console.error("Failed to sync user", error);
      })
      .finally(() => {
        if (isActive) {
          setIsSyncing(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [user, convexUserId, isReady, syncUser]);

  const login = () => {
    startWorkosLogin().catch((error) => {
      console.error("WorkOS login failed", error);
    });
  };

  const logout = () => {
    clearSession();
    setUser(null);
    setConvexUserId(null);
  };

  const value = useMemo(
    () => ({
      user,
      convexUserId,
      isReady,
      isSyncing,
      login,
      logout,
    }),
    [user, convexUserId, isReady, isSyncing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
