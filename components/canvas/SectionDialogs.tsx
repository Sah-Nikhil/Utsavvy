"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { SECTION_NAME_MAX, cleanSectionName } from "@/lib/canvas/starting";

/*
 * Creating, renaming and deleting a Section. One dialog serves the whole
 * Canvas; Section labels and the toolbar open it through `useSectionDialogs()`.
 */

type Open =
  | { mode: "create" }
  | { mode: "rename"; section: Doc<"sections"> }
  | { mode: "delete"; section: Doc<"sections"> };

type SectionDialogs = {
  create: () => void;
  rename: (section: Doc<"sections">) => void;
  remove: (section: Doc<"sections">) => void;
};

const SectionDialogsContext = createContext<SectionDialogs>({
  create: () => {},
  rename: () => {},
  remove: () => {},
});

export function useSectionDialogs(): SectionDialogs {
  return useContext(SectionDialogsContext);
}

/** What went wrong, in words, from a refused Section change. */
function problemText(error: unknown): string {
  const data =
    error instanceof ConvexError
      ? (error.data as { kind?: string; problem?: string; reason?: string })
      : null;
  if (data?.kind === "CanvasRefused") {
    switch (data.problem) {
      case "empty":
        return "Give the Section a name.";
      case "tooLong":
        return `Keep the name to ${SECTION_NAME_MAX} characters.`;
      case "notEmpty":
        return "Move or delete its Items first: a starting Section's Items have nowhere else to go.";
      case "noHome":
        return "Its Items need a starting Section to go back to, and none is left.";
      case "deleted":
        return "Someone already deleted this Section.";
    }
  }
  if (data?.kind === "AccessDenied")
    return "Your role in this Event can't do that.";
  return "That didn't work. Try again.";
}

export function SectionDialogsProvider({
  eventId,
  children,
}: {
  eventId: Id<"events">;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<Open | null>(null);
  const value = useMemo<SectionDialogs>(
    () => ({
      create: () => setOpen({ mode: "create" }),
      rename: (section) => setOpen({ mode: "rename", section }),
      remove: (section) => setOpen({ mode: "delete", section }),
    }),
    [],
  );
  return (
    <SectionDialogsContext.Provider value={value}>
      {children}
      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        {open ? (
          <SectionDialogBody
            key={open.mode + ("section" in open ? open.section._id : "")}
            open={open}
            eventId={eventId}
            close={() => setOpen(null)}
          />
        ) : null}
      </Dialog>
    </SectionDialogsContext.Provider>
  );
}

function SectionDialogBody({
  open,
  eventId,
  close,
}: {
  open: Open;
  eventId: Id<"events">;
  close: () => void;
}) {
  const createSection = useMutation(api.canvas.createSection);
  const renameSection = useMutation(api.canvas.renameSection);
  const deleteSection = useMutation(api.canvas.deleteSection);
  const [name, setName] = useState(
    open.mode === "rename" ? open.section.name : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      close();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setBusy(false);
    }
  }

  if (open.mode === "delete") {
    const starting = open.section.kind !== "custom";
    return (
      <DialogContent
        title={`Delete “${open.section.name}”?`}
        description={
          starting
            ? "This is a starting Section. It can be deleted once it holds no Items, and Restore in the edit history brings it back."
            : "Its Items move back to their starting Sections. Restore in the edit history brings the Section back."
        }
      >
        {error ? (
          <p role="alert" className="mt-4 text-label text-warn">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="text" />}>Cancel</DialogClose>
          <Button
            disabled={busy}
            onClick={() =>
              run(() => deleteSection({ sectionId: open.section._id }))
            }
          >
            Delete Section
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  const cleaned = cleanSectionName(name);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!cleaned.ok) {
      setError(
        cleaned.problem === "empty"
          ? "Give the Section a name."
          : `Keep the name to ${SECTION_NAME_MAX} characters.`,
      );
      return;
    }
    void run(() =>
      open.mode === "create"
        ? createSection({ eventId, name: cleaned.name })
        : renameSection({ sectionId: open.section._id, name: cleaned.name }),
    );
  }

  return (
    <DialogContent
      title={open.mode === "create" ? "New Section" : "Rename Section"}
      description={
        open.mode === "create"
          ? "A Section of your own, such as one per Function. It goes below the others on the Canvas."
          : undefined
      }
    >
      <form onSubmit={submit} className="mt-5 grid gap-5">
        <Field label="Name" error={error ?? undefined}>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sangeet night"
          />
        </Field>
        <DialogFooter className="mt-0">
          <DialogClose render={<Button type="button" variant="text" />}>
            Cancel
          </DialogClose>
          <Button type="submit" disabled={busy}>
            {open.mode === "create" ? "Add Section" : "Rename"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
