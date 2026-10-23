"use client";

import { useMutation } from "convex/react";
import { useQuery } from "convex/react";
import { ExternalLink, StickyNote } from "lucide-react";
import { useId, useState } from "react";
import { useCanvasItem } from "@/components/canvas/CanvasItemContext";
import { ItemFrame } from "@/components/items/ItemFrame";
import type { ItemComponentProps } from "@/components/items/registry";
import { errorMessage } from "@/components/people/errors";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { scriptClass } from "@/lib/script";
import { cn } from "@/lib/utils";

/*
 * A Note (S4): a Member's own words on the Canvas, or a saved web search
 * answer with its sources. Members edit the text in place.
 */

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function NoteItem({ item }: ItemComponentProps<"note">) {
  const canvas = useCanvasItem();
  const update = useMutation(api.notes.update);
  // Whether this person may edit comes from the Canvas's own query.
  const canvasView = useQuery(api.canvas.get, { eventId: item.eventId });
  const canEdit = canvasView !== undefined && canvasView.me.role !== "viewer";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.data.text);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorId = useId();
  const { data } = item;

  async function save() {
    setSaving(true);
    try {
      await update({ itemId: item._id, text });
      setEditing(false);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "That didn't save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ItemFrame
      kind="Note"
      icon={<StickyNote />}
      title={data.citations.length > 0 ? "Saved answer" : "Note"}
      functionIndex={canvas?.functionIndex}
      functionName={canvas?.functionName}
      actions={
        canEdit && !editing ? (
          <Button
            variant="text"
            size="sm"
            onClick={() => {
              setText(data.text);
              setEditing(true);
            }}
          >
            Edit
          </Button>
        ) : null
      }
    >
      {editing ? (
        <form
          className="grid gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <textarea
            // The person asked to edit this Note just now.
            autoFocus
            aria-label="Note text"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            className={cn(
              "w-full min-w-0 resize-y rounded-xs border border-rule-strong bg-surface px-2 py-1.5 text-body text-ink",
              "focus-visible:border-action focus-visible:shadow-[inset_0_0_0_1px_var(--action)] focus-visible:outline-none",
              scriptClass(text),
            )}
          />
          {error ? (
            <p id={errorId} role="alert" className="text-caption text-warn">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="text"
              size="sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="tonal" size="sm" disabled={saving}>
              Save
            </Button>
          </div>
        </form>
      ) : (
        <p
          className={cn(
            "text-body whitespace-pre-wrap text-ink",
            scriptClass(data.text),
          )}
        >
          {data.text}
        </p>
      )}
      {data.citations.length > 0 ? (
        <ul aria-label="Sources" className="mt-2 grid gap-0.5 text-caption">
          {data.citations.map((c) => (
            <li key={c.url} className="min-w-0">
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1 text-action underline underline-offset-2 hover:text-action-strong"
              >
                <span className="truncate">{c.title ?? hostOf(c.url)}</span>
                <ExternalLink aria-hidden className="size-3 shrink-0" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </ItemFrame>
  );
}
