"use client";

type Scan = {
  _id: string;
  _creationTime: number;
  status: string;
  imageUrl?: string | null;
  extractedData?: {
    brand?: string | null;
    styleNumber?: string | null;
    size?: string | null;
    materials?: string[] | null;
    conditionAssessment?: {
      overallGrade?: string | null;
    } | null;
  } | null;
  researchResults?: {
    listings?: Listing[] | null;
    soldListings?: Listing[] | null;
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
    confidence?: number;
    demandLevel?: string;
    marketActivity?: string;
  } | null;
};

type Listing = {
  title: string;
  price: number;
  currency: string;
  platform: string;
  url: string;
};

const statusLabels: Record<string, string> = {
  uploaded: "Queued",
  extracting: "Reading tag",
  awaiting_clarification: "Needs input",
  researching: "Searching web",
  refining: "Analyzing",
  completed: "Complete",
  failed: "Failed",
};

function formatCurrency(amount: number, currency?: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ScanDetail({ scan }: { scan: Scan | null }) {
  if (!scan) {
    return (
      <section className="surface-card rounded-3xl p-6 shadow-glow animate-rise">
        <p className="text-sm text-white/60">
          Select a scan to see details.
        </p>
      </section>
    );
  }

  const suggested = scan.refinedFindings?.suggestedPriceRange;
  const listings = scan.researchResults?.listings ?? [];
  const sold = scan.researchResults?.soldListings ?? [];

  return (
    <section className="surface-card rounded-3xl p-6 shadow-glow animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="tag tag-accent">Scan Detail</p>
          <h2 className="mt-3 font-display text-2xl text-white">
            {scan.extractedData?.brand ?? "Untitled item"}
          </h2>
          <p className="mt-1 text-xs text-white/50">
            {new Date(scan._creationTime).toLocaleString()}
          </p>
        </div>
        <span className="tag tag-muted">
          {statusLabels[scan.status] ?? scan.status}
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            {scan.imageUrl ? (
              <img
                src={scan.imageUrl}
                alt="Scan"
                className="h-64 w-full object-cover"
              />
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-white/50">
                No image available
              </div>
            )}
          </div>

          <div className="grid gap-3 text-xs text-white/70 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Size
              </p>
              <p className="mt-2 text-sm text-white">
                {scan.extractedData?.size ?? "Not detected"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Materials
              </p>
              <p className="mt-2 text-sm text-white">
                {scan.extractedData?.materials?.join(", ") ?? "Not detected"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Recommended price
            </p>
            {suggested ? (
              <div className="mt-3">
                <p className="text-3xl font-semibold text-white">
                  {formatCurrency(suggested.recommended, suggested.currency)}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  Range {formatCurrency(suggested.low, suggested.currency)} —{" "}
                  {formatCurrency(suggested.high, suggested.currency)}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-white/60">
                Pricing will appear once the pipeline finishes.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Market snapshot
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/70">
              <span className="tag tag-muted">
                {scan.researchResults?.marketRegion ?? "Market unknown"}
              </span>
              <span className="tag tag-muted">
                {scan.researchResults?.primaryCurrency ?? "Currency TBD"}
              </span>
              <span className="tag tag-muted">{sold.length} sold comps</span>
              <span className="tag tag-muted">{listings.length} active comps</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Top comps
            </p>
            <div className="mt-3 space-y-3 text-sm text-white/70">
              {(sold.length ? sold : listings).slice(0, 3).map((listing) => (
                <a
                  key={listing.url}
                  href={listing.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-white/20"
                >
                  <p className="text-sm text-white">{listing.title}</p>
                  <p className="mt-1 text-xs text-white/60">
                    {listing.platform} •{" "}
                    {formatCurrency(listing.price, listing.currency)}
                  </p>
                </a>
              ))}
              {!sold.length && !listings.length && (
                <p className="text-xs text-white/50">
                  Comps will appear after research runs.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
