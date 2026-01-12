"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";

const MAX_FILES = 6;

type UploadPanelProps = {
  userId: string;
  onScanCreated?: (scanId: string) => void;
};

type PreviewItem = {
  file: File;
  url: string;
};

export function UploadPanel({ userId, onScanCreated }: UploadPanelProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const generateUploadUrl = useMutation(
    "scans:generateUploadUrl" as unknown as FunctionReference<"mutation">
  );
  const createScan = useMutation(
    "scans:createScan" as unknown as FunctionReference<"mutation">
  );
  const processMultiImageScan = useAction(
    "pipeline/orchestrator:processMultiImageScan" as unknown as FunctionReference<"action">
  );

  const fileCountLabel = useMemo(() => {
    if (!files.length) {
      return "No files selected";
    }
    return `${files.length} file${files.length === 1 ? "" : "s"} ready`;
  }, [files.length]);

  useEffect(() => {
    const nextPreviews = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPreviews(nextPreviews);
    return () => {
      nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [files]);

  const handleFiles = (nextFiles: FileList | null) => {
    if (!nextFiles) {
      return;
    }
    const selected = Array.from(nextFiles).slice(0, MAX_FILES);
    setFiles(selected);
    setError(null);
    setStatus(null);
  };

  const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files.length) {
      handleFiles(event.dataTransfer.files);
    }
  };

  const uploadImages = async () => {
    setIsSubmitting(true);
    setError(null);
    setStatus("Preparing upload...");

    try {
      const storageIds: string[] = [];
      for (const [index, file] of files.entries()) {
        setStatus(`Uploading ${index + 1} of ${files.length}...`);
        const uploadUrl = await generateUploadUrl({});
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "image/jpeg",
          },
          body: file,
        });

        if (!response.ok) {
          throw new Error("Upload failed. Please try again.");
        }

        const payload = (await response.json()) as { storageId: string };
        storageIds.push(payload.storageId);
      }

      setStatus("Creating scan record...");
      const scanId = (await createScan({
        userId,
        imageStorageId: storageIds[0],
      })) as string;

      onScanCreated?.(scanId);
      setStatus("Processing started. This can take up to 90 seconds.");

      void processMultiImageScan({
        scanId,
        imageStorageIds: storageIds,
      }).catch((processError) => {
        console.error("Pipeline error", processError);
        setError("Processing failed. Please retry the scan.");
      });

      setFiles([]);
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="surface-card rounded-3xl p-6 shadow-glow animate-rise">
      <div className="flex items-start justify-between">
        <div>
          <p className="tag tag-accent">New Scan</p>
          <h2 className="mt-3 font-display text-2xl text-white">
            Upload an intake set
          </h2>
          <p className="mt-2 text-sm text-white/70">
            Add tag, garment, and condition photos to get the most accurate
            pricing.
          </p>
        </div>
        <span className="tag tag-muted">Up to {MAX_FILES}</span>
      </div>

      <label
        className="mt-6 flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 text-center text-sm text-white/60 transition hover:border-white/30"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <span className="text-base text-white">Drag photos here</span>
        <span className="text-xs text-white/60">or tap to upload</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </label>

      <div className="mt-4 flex items-center justify-between text-xs text-white/60">
        <span>{fileCountLabel}</span>
        <span>JPG, PNG, HEIC supported</span>
      </div>

      {previews.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {previews.map((preview) => (
            <div
              key={preview.url}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/5"
            >
              <img
                src={preview.url}
                alt={preview.file.name}
                className="h-24 w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {status && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
          {status}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          onClick={uploadImages}
          disabled={!files.length || isSubmitting}
        >
          {isSubmitting ? "Uploading…" : "Upload & Analyze"}
        </button>
        <p className="text-xs text-white/50">
          Processing continues in the background—keep scanning while it works.
        </p>
      </div>
    </section>
  );
}
