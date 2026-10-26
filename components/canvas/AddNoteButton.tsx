"use client";

import { useMutation } from "convex/react";
import { StickyNote } from "lucide-react";
import { useState, type FormEvent } from "react";
import { errorMessage } from "@/components/people/errors";
import {
  useRequestReveal,
  useSetSelection,
} from "@/components/shell/selection";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { scriptClass } from "@/lib/script";
import { useFunctionFilter } from "./FunctionFilter";

/*
 * "Add a Note" on the freeform Canvas's toolbar (S4's `api.notes.add`, review
 * of #92). The Note lands in free space in the Notes Section, tagged with the
 * Function the filter shows, and is selected, so the Canvas pans to it.
 */
export function AddNoteButton({ eventId }: { eventId: Id<"events"> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="tonal"
        size="sm"
        onClick={() => setOpen(true)}
        className="shadow-item"
      >
        <StickyNote aria-hidden />
        Add a Note
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <AddNoteForm eventId={eventId} close={() => setOpen(false)} />
        ) : null}
      </Dialog>
    </>
  );
}

function AddNoteForm({
  eventId,
  close,
}: {
  eventId: Id<"events">;
  close: () => void;
}) {
  const add = useMutation(api.notes.add);
  const setSelection = useSetSelection();
  const requestReveal = useRequestReveal();
  const filter = useFunctionFilter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const functionName = filter.functions.find(
    (fn) => fn.key === filter.functionKey,
  )?.name;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim() === "") {
      setError("Write something in the Note first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const itemId = await add({
        eventId,
        text,
        functionKey: filter.functionKey,
      });
      close();
      setSelection({ kind: "item", itemId });
      requestReveal(itemId);
    } catch (caught) {
      setError(errorMessage(caught, "The Note didn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent
      title="Add a Note"
      description={
        functionName
          ? `It goes in the Notes Section, for the ${functionName}. Everyone in the Event sees it.`
          : "It goes in the Notes Section. Everyone in the Event sees it."
      }
    >
      <form onSubmit={submit} className="mt-5 grid gap-5">
        <Field label="Note" error={error ?? undefined}>
          <Textarea
            autoFocus
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ask Nani about the haldi songs"
            className={scriptClass(text)}
          />
        </Field>
        <DialogFooter className="mt-0">
          <DialogClose render={<Button type="button" variant="text" />}>
            Cancel
          </DialogClose>
          <Button type="submit" disabled={busy}>
            Add Note
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
