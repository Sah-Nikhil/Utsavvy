"use client";

import { useAction } from "convex/react";
import { CircleAlert, CircleCheck, ImageUp, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  checkUploadBatch,
  MAX_UPLOADS_PER_BATCH,
  UPLOAD_RIGHTS_WORDING,
  UPLOAD_TYPES,
} from "@/lib/inspirations/uploads";
import { cn } from "@/lib/utils";
import { prepareUpload } from "./prepareUpload";

/*
 * Upload (inspirations.md rules 4 and 5): JPEG, PNG and WebP, up to 10 MB each
 * and 10 at a time, by picking, dragging in or pasting (Ctrl+V after "Copy
 * image"). Each photo is shrunk to 2048 px before it uploads. With the Event's
 * upload rights setting off, each batch asks for one tick first.
 */

type Row = {
  key: string;
  name: string;
  state: "waiting" | "uploading" | "done" | "failed";
  message?: string;
};

export function UploadTab({
  eventId,
  rightsOn,
}: {
  eventId: Id<"events">;
  rightsOn: boolean;
}) {
  const inputId = useId();
  const rightsId = useId();
  const noteId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const addUpload = useAction(api.inspirations.addUpload);
  const busy = rows.some(
    (r) => r.state === "uploading" || r.state === "waiting",
  );

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const upload = useCallback(
    async (files: File[], rightsTicked: boolean) => {
      const batch = files.map((file, i) => ({
        file,
        key: `${Date.now()}-${i}-${file.name}`,
      }));
      setRows(
        batch.map(({ key, file }) => ({
          key,
          name: file.name || "Pasted photo",
          state: "waiting",
        })),
      );
      for (const { file, key } of batch) {
        setRow(key, { state: "uploading" });
        try {
          const { blob, palette } = await prepareUpload(file);
          // The photo's bytes go to addUpload, which stores the file itself.
          await addUpload({
            eventId,
            file: await blob.arrayBuffer(),
            rightsTicked,
            palette,
          });
          setRow(key, { state: "done" });
        } catch (e) {
          setRow(key, {
            state: "failed",
            message: errorMessage(e, "Couldn't upload this photo. Try again."),
          });
        }
      }
      setTicked(false);
    },
    [addUpload, eventId],
  );

  /** Checks a new batch; uploads it now, or holds it for the rights tick. */
  const offer = useCallback(
    (files: File[]) => {
      if (busy) return;
      const check = checkUploadBatch(files, { rightsOn, ticked: true });
      if (!check.ok) {
        setProblem(check.message);
        return;
      }
      setProblem(null);
      if (rightsOn) void upload(files, false);
      else {
        setPending(files);
        setTicked(false);
        setRows([]);
      }
    },
    [busy, rightsOn, upload],
  );

  // Paste from the clipboard while this tab is open.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const files = [...(event.clipboardData?.files ?? [])].filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length === 0) return;
      event.preventDefault();
      offer(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [offer]);

  function confirmPending() {
    const check = checkUploadBatch(pending, { rightsOn, ticked });
    if (!check.ok) {
      setProblem(check.message);
      return;
    }
    const files = pending;
    setPending([]);
    setProblem(null);
    void upload(files, true);
  }

  return (
    <div className="grid gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          offer([...e.dataTransfer.files]);
        }}
        className={cn(
          "grid justify-items-center gap-3 rounded-md border border-dashed px-5 py-7 text-center",
          "transition-[background-color,border-color] duration-(--dur-feedback) ease-standard",
          dragging
            ? "border-action bg-action-tonal"
            : "border-rule-strong bg-surface-sunk",
        )}
      >
        <span
          aria-hidden
          className="grid size-11 place-items-center rounded-full bg-surface text-action shadow-item"
        >
          <ImageUp className="size-5" />
        </span>
        <div className="grid gap-1">
          <p className="font-display text-title text-ink">Drop photos here</p>
          <p className="text-label text-ink-2">
            or paste one with Ctrl+V. JPEG, PNG or WebP, up to 10 MB each,{" "}
            {MAX_UPLOADS_PER_BATCH} at a time.
          </p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={UPLOAD_TYPES.join(",")}
          className="sr-only"
          aria-describedby={noteId}
          onChange={(e) => {
            offer([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <Button
          variant="filled"
          size="md"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose photos
        </Button>
      </div>
      <p id={noteId} className="text-caption text-ink-3">
        Photos with people in them are fine to keep, but Remix works best on
        decor-only shots. Uploads are visible only to this Event&apos;s Members.
      </p>

      {pending.length > 0 ? (
        <div className="grid gap-3 rounded-md border border-rule bg-surface px-4 py-3.5">
          <p className="text-label font-semibold text-ink">
            {pending.length} {pending.length === 1 ? "photo" : "photos"} ready
            to upload
          </p>
          <label
            htmlFor={rightsId}
            className="flex items-start gap-2.5 text-label text-ink-2"
          >
            <input
              id={rightsId}
              type="checkbox"
              checked={ticked}
              onChange={(e) => setTicked(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-(--action)"
            />
            <span>{UPLOAD_RIGHTS_WORDING}</span>
          </label>
          <div className="flex gap-2">
            <Button size="sm" disabled={!ticked} onClick={confirmPending}>
              Upload
            </Button>
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                setPending([]);
                setProblem(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {problem ? (
        <p role="alert" className="text-label text-warn">
          {problem}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul aria-live="polite" className="grid gap-1.5">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-start gap-2 text-label text-ink-2"
            >
              {row.state === "done" ? (
                <CircleCheck
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-booked"
                />
              ) : row.state === "failed" ? (
                <CircleAlert
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-warn"
                />
              ) : (
                <LoaderCircle
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 animate-spin text-ink-3 motion-reduce:animate-none"
                />
              )}
              <span className="min-w-0">
                <span className="block truncate text-ink">{row.name}</span>
                <span className="block text-caption text-ink-3">
                  {row.state === "done"
                    ? "Added to Inspirations"
                    : row.state === "failed"
                      ? row.message
                      : row.state === "uploading"
                        ? "Uploading"
                        : "Waiting"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
