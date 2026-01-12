"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { useAuth } from "@/components/auth/AuthProvider";
import { UploadPanel } from "@/components/dashboard/UploadPanel";
import { ScanList } from "@/components/dashboard/ScanList";
import { ScanDetail } from "@/components/dashboard/ScanDetail";

type Scan = {
  _id: string;
  _creationTime: number;
  status: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  extractedData?: {
    brand?: string | null;
    styleNumber?: string | null;
    size?: string | null;
    materials?: string[] | null;
  } | null;
  researchResults?: {
    listings?: Array<{
      title: string;
      price: number;
      currency: string;
      platform: string;
      url: string;
    }> | null;
    soldListings?: Array<{
      title: string;
      price: number;
      currency: string;
      platform: string;
      url: string;
    }> | null;
    marketRegion?: string | null;
    primaryCurrency?: string | null;
  } | null;
  refinedFindings?: {
    suggestedPriceRange: {
      low: number;
      high: number;
      recommended: number;
      currency: string;
    };
  } | null;
};

export function Dashboard() {
  const { user, convexUserId, logout } = useAuth();
  const scans = useQuery(
    api.scans.getUserScans,
    convexUserId ? { userId: convexUserId } : "skip"
  ) as Scan[] | undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isLoadingScans = Boolean(convexUserId && scans === undefined);

  useEffect(() => {
    if (!selectedId && scans && scans.length > 0) {
      setSelectedId(scans[0]._id);
    }
  }, [scans, selectedId]);

  const selectedScan = useMemo(() => {
    if (!selectedId || !scans) {
      return null;
    }
    return scans.find((scan) => scan._id === selectedId) ?? null;
  }, [scans, selectedId]);

  return (
    <div className="min-h-screen bg-app">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">
            Free Time Portal
          </p>
          <h1 className="mt-2 font-display text-3xl text-white">
            Consigner intake control room
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-white/60">
            <p className="text-white/80">{user?.email}</p>
            <p>Signed in</p>
          </div>
          <button className="btn-secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-6 px-6 pb-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          {convexUserId && (
            <UploadPanel
              userId={convexUserId}
              onScanCreated={(scanId) => setSelectedId(scanId)}
            />
          )}
          <div className="surface-card rounded-3xl p-6 shadow-glow animate-rise">
            <p className="tag tag-accent">Workflow tips</p>
            <ul className="mt-4 space-y-3 text-sm text-white/70">
              <li>
                Capture the brand tag first for the highest confidence match.
              </li>
              <li>
                Add a flat-lay garment shot so the pipeline can detect era and
                style cues.
              </li>
              <li>
                Use a close-up of defects to influence condition grading.
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <ScanList
            scans={scans ?? []}
            selectedId={selectedId}
            onSelect={setSelectedId}
            isLoading={isLoadingScans}
          />
          <ScanDetail scan={selectedScan} />
        </div>
      </main>
    </div>
  );
}
