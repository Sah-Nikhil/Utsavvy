"use client";

import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { api } from "@/convex/_generated/api";
import type { EventType } from "@/lib/types/brief";
import { ChoiceGroup } from "./ChoiceGroup";
import { errorMessage } from "./errors";
import {
  EVENT_TYPE_LABELS,
  UPLOAD_RIGHTS_CHOICES,
  type OwnerLabel,
} from "./labels";

const EVENT_TYPES = (Object.keys(EVENT_TYPE_LABELS) as EventType[]).map(
  (value) => ({ value, label: EVENT_TYPE_LABELS[value] }),
);

export const OWNER_LABEL_CHOICES = [
  { value: "owner", label: "Owner", description: "with Co-owners" },
  { value: "host", label: "Host", description: "with Co-hosts" },
] as const;

/** "New Event": name, Event type, Owner or Host label and upload rights, then the workspace. */
export function NewEventDialog() {
  const router = useRouter();
  const create = useMutation(api.events.create);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [ownerLabel, setOwnerLabel] = useState<OwnerLabel>("owner");
  const [uploadRights, setUploadRights] = useState<"on" | "off">("off");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === "") {
      setError("Give the Event a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const eventId = await create({
        name,
        eventType,
        ownerLabel,
        uploadRightsOn: uploadRights === "on",
      });
      router.push(`/events/${eventId}`);
    } catch (err) {
      setBusy(false);
      setError(errorMessage(err, "The Event couldn't be created. Try again."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden />
        New Event
      </DialogTrigger>
      <DialogContent
        title="New Event"
        description={`You'll run it as its ${ownerLabel === "host" ? "Host" : "Owner"}. The Assistant asks about the rest once it opens.`}
        className="w-[min(36rem,calc(100vw-2rem))]"
      >
        <form onSubmit={submit} className="mt-5 grid gap-5" noValidate>
          <Field
            label="Event name"
            description="For example: Meera weds Rohan, or Kothrud Ganesh utsav."
            error={error ?? undefined}
          >
            <Input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              maxLength={120}
            />
          </Field>
          <ChoiceGroup
            label="Event type"
            choices={EVENT_TYPES}
            value={eventType}
            onChange={setEventType}
            columns={3}
          />
          <ChoiceGroup
            label="Call the person running it"
            description="Only the name changes. You can switch it later in Event settings."
            choices={OWNER_LABEL_CHOICES}
            value={ownerLabel}
            onChange={setOwnerLabel}
          />
          <ChoiceGroup
            label="Images Members upload"
            description="Everyone in the Event follows this setting."
            choices={UPLOAD_RIGHTS_CHOICES}
            value={uploadRights}
            onChange={setUploadRights}
            columns={1}
          />
          <DialogFooter className="mt-1">
            <Button type="button" variant="text" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create Event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
