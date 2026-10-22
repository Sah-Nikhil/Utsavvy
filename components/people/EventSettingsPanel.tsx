"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api } from "@/convex/_generated/api";
import { ChoiceGroup } from "./ChoiceGroup";
import { errorMessage } from "./errors";
import { roleLabel, UPLOAD_RIGHTS_CHOICES, type OwnerLabel } from "./labels";
import { OWNER_LABEL_CHOICES } from "./NewEventDialog";
import { useMembership, type Membership } from "./useMembership";

// S1 owns this file: the Event's name, the Owner or Host label, upload rights and defaults.

export type EventSettingsPanelProps = { eventId: string };

type ActiveMembership = Extract<Membership, { status: "active" }>;

const GROUPING_CHOICES = [
  {
    value: "kind",
    label: "By kind",
    description: "Budget, Timeline, Vendors, Notes…",
  },
  {
    value: "function",
    label: "By Function",
    description: "Haldi, mehendi, sangeet…",
  },
] as const;

const POINTING_CHOICES = [
  {
    value: "jump",
    label: "Jump to the Canvas",
    description: "Opens the Canvas tab with the Item highlighted.",
  },
  {
    value: "sheet",
    label: "Open a preview",
    description: "Shows the Item in a sheet over the Chat.",
  },
] as const;

/**
 * Event settings: the Owner and Co-owners change them; everyone else sees
 * them read-only. Each change writes the Event's history.
 */
export function EventSettingsPanel({ eventId }: EventSettingsPanelProps) {
  const me = useMembership(eventId);
  if (me === undefined) {
    return <p className="text-label text-ink-3">Loading settings…</p>;
  }
  if (me.status === "denied") {
    return (
      <p className="text-label text-ink-2">
        You&apos;re not in this Event, so its settings aren&apos;t shown.
      </p>
    );
  }
  return <Settings me={me} />;
}

function Settings({ me }: { me: ActiveMembership }) {
  const event = useQuery(api.events.get, { eventId: me.eventId });
  const setOwnerLabel = useMutation(api.events.setOwnerLabel);
  const setUploadRights = useMutation(api.events.setUploadRights);
  const setDefaults = useMutation(api.events.setDefaults);
  const [error, setError] = useState<string | null>(null);

  if (event === undefined) {
    return <p className="text-label text-ink-3">Loading settings…</p>;
  }
  const canEdit = me.can("event.defaults");
  const eventId = me.eventId;
  const save = (change: Promise<unknown>) => {
    setError(null);
    change.catch((err: unknown) =>
      setError(errorMessage(err, "That setting didn't save. Try again.")),
    );
  };

  return (
    <div className="grid gap-6">
      {canEdit ? null : (
        <p className="rounded-md border border-rule bg-surface-sunk px-3 py-2 text-caption text-ink-2">
          Only the {roleLabel("owner", event.ownerLabel)} and{" "}
          {roleLabel("coOwner", event.ownerLabel)}s change these settings.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-label font-medium text-warn">
          {error}
        </p>
      ) : null}

      <EventName
        key={event.name}
        eventId={eventId}
        name={event.name}
        canEdit={me.can("event.rename")}
      />

      <ChoiceGroup<OwnerLabel>
        label="Call the person running it"
        description="Only the name changes; the role and its powers stay the same."
        choices={OWNER_LABEL_CHOICES}
        value={event.ownerLabel}
        onChange={(ownerLabel) => save(setOwnerLabel({ eventId, ownerLabel }))}
        disabled={!me.can("event.rename")}
      />

      <ChoiceGroup
        label="Images Members upload"
        description="Everyone in the Event follows this setting."
        choices={UPLOAD_RIGHTS_CHOICES}
        value={event.uploadRightsOn ? "on" : "off"}
        onChange={(value) =>
          save(setUploadRights({ eventId, on: value === "on" }))
        }
        disabled={!canEdit}
        columns={1}
      />

      <ChoiceGroup
        label="Compact view grouping"
        description="How the Compact view groups Items for everyone, until a person picks their own."
        choices={GROUPING_CHOICES}
        value={event.defaults.compactGrouping}
        onChange={(compactGrouping) =>
          save(setDefaults({ eventId, compactGrouping }))
        }
        disabled={!canEdit}
      />

      <ChoiceGroup
        label="On a phone, tapping an Item in the Chat"
        description="The Event's default. Each person can change it for themselves in their settings."
        choices={POINTING_CHOICES}
        value={event.defaults.mobilePointing}
        onChange={(mobilePointing) =>
          save(setDefaults({ eventId, mobilePointing }))
        }
        disabled={!canEdit}
      />
    </div>
  );
}

function EventName({
  eventId,
  name,
  canEdit,
}: {
  eventId: ActiveMembership["eventId"];
  name: string;
  canEdit: boolean;
}) {
  const rename = useMutation(api.events.rename);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await rename({ eventId, name: value });
    } catch (err) {
      setError(errorMessage(err, "The name didn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      <Field label="Event name" error={error ?? undefined} disabled={!canEdit}>
        <Input
          name="name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={120}
          autoComplete="off"
        />
      </Field>
      {canEdit && value.trim() !== name ? (
        <div>
          <Button type="submit" size="sm" disabled={busy}>
            Save name
          </Button>
        </div>
      ) : null}
    </form>
  );
}
