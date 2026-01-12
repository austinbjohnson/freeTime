"use client";

const statusLabels: Record<string, string> = {
  uploaded: "Queued",
  extracting: "Reading tag",
  awaiting_clarification: "Needs input",
  researching: "Searching web",
  refining: "Analyzing",
  completed: "Complete",
  failed: "Failed",
};

const statusColors: Record<string, string> = {
  uploaded: "bg-white/30",
  extracting: "bg-amber-400",
  awaiting_clarification: "bg-rose-400",
  researching: "bg-sky-400",
  refining: "bg-emerald-400",
  completed: "bg-emerald-400",
  failed: "bg-rose-400",
};

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
  } | null;
};

type ScanListProps = {
  scans: Scan[];
  selectedId: string | null;
  onSelect: (scanId: string) => void;
  isLoading?: boolean;
};

export function ScanList({
  scans,
  selectedId,
  onSelect,
  isLoading = false,
}: ScanListProps) {
  return (
    <section className="surface-card rounded-3xl p-6 shadow-glow animate-rise">
      <div className="flex items-center justify-between">
        <div>
          <p className="tag tag-accent">Scan Queue</p>
          <h2 className="mt-3 font-display text-2xl text-white">Live scans</h2>
        </div>
        <span className="text-xs text-white/60">{scans.length} items</span>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            Loading scans…
          </div>
        )}
        {!isLoading && scans.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            No scans yet. Upload a set to get started.
          </div>
        )}
        {scans.map((scan) => {
          const title =
            scan.extractedData?.brand ??
            scan.extractedData?.styleNumber ??
            "Processing item";
          const subtitle = scan.extractedData?.size
            ? `Size ${scan.extractedData.size}`
            : new Date(scan._creationTime).toLocaleString();
          return (
            <button
              key={scan._id}
              className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                selectedId === scan._id
                  ? "border-white/30 bg-white/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
              onClick={() => onSelect(scan._id)}
            >
              <div className="h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                {scan.thumbnailUrl || scan.imageUrl ? (
                  <img
                    src={scan.thumbnailUrl ?? scan.imageUrl ?? ""}
                    alt="Scan thumbnail"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
                    FT
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm text-white">{title}</p>
                <p className="text-xs text-white/50">{subtitle}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/70">
                <span
                  className={`status-dot ${statusColors[scan.status] ?? "bg-white/30"} ${
                    scan.status !== "completed" && scan.status !== "failed"
                      ? "pulse-soft"
                      : ""
                  }`}
                />
                <span>{statusLabels[scan.status] ?? scan.status}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
