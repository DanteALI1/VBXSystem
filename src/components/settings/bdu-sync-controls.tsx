"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EnqueueResult = {
  ok?: boolean;
  queued?: boolean;
  jobId?: string;
  mode?: string;
  fileHash?: string;
  error?: string | { message?: string };
};

export function BduSyncControls() {
  const [busy, setBusy] = useState<"download" | "upload" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enqueueDownload() {
    setBusy("download");
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/sync/bdu", { method: "POST" });
      const body = (await res.json()) as EnqueueResult;
      if (!res.ok) {
        const msg =
          typeof body.error === "string"
            ? body.error
            : body.error?.message ?? `HTTP ${res.status}`;
        setError(msg);
        return;
      }
      setMessage(`BDU download queued (job ${body.jobId ?? "—"}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("upload");
    setMessage(null);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch("/api/settings/sync/bdu/upload", {
        method: "POST",
        body: fd,
      });
      const body = (await res.json()) as EnqueueResult;
      if (!res.ok) {
        const msg =
          typeof body.error === "string"
            ? body.error
            : body.error?.message ?? `HTTP ${res.status}`;
        setError(msg);
        return;
      }
      setMessage(
        `BDU upload accepted (job ${body.jobId ?? "—"}, hash ${body.fileHash?.slice(0, 12) ?? "—"}).`,
      );
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800"
      data-testid="bdu-sync-controls"
    >
      <div>
        <h2 className="text-sm font-semibold tracking-tight">BDU (ФСТЭК)</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Download vulxml or upload XML when the remote feed is unreachable.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy !== null}
          onClick={() => void enqueueDownload()}
          data-testid="bdu-sync-download"
        >
          {busy === "download" ? "Enqueueing…" : "Sync from URL"}
        </Button>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => void onUpload(e)}
        data-testid="bdu-sync-upload-form"
      >
        <div className="min-w-[12rem] flex-1 space-y-1">
          <label
            htmlFor="bdu-upload-file"
            className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
          >
            Admin upload fallback
          </label>
          <Input
            id="bdu-upload-file"
            name="file"
            type="file"
            accept=".xml,application/xml,text/xml"
            required
            disabled={busy !== null}
            className="h-8 cursor-pointer text-xs"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          data-testid="bdu-sync-upload"
        >
          {busy === "upload" ? "Uploading…" : "Upload XML"}
        </Button>
      </form>

      {message ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
