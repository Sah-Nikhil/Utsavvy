"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ChoiceGroup } from "@/components/people/ChoiceGroup";
import { errorMessage } from "@/components/people/errors";
import { api } from "@/convex/_generated/api";

type Pointing = "event" | "jump" | "sheet";

const POINTING_CHOICES = [
  {
    value: "event",
    label: "Each Event's default",
    description: "Follow what the Owner set for that Event.",
  },
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
 * The person's own settings (S16): for now, what tapping an Item in the Chat
 * does on a phone. It applies in every Event they're in, over each Event's
 * default.
 */
export function PersonalSettings() {
  const { isAuthenticated } = useConvexAuth();
  // The `users` row exists once EnsureUser has run after sign-in.
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const value = useQuery(api.viewPrefs.myMobilePointing, me ? {} : "skip");
  const setMobilePointing = useMutation(
    api.viewPrefs.setMobilePointing,
  ).withOptimisticUpdate((store, { value: next }) => {
    store.setQuery(api.viewPrefs.myMobilePointing, {}, next);
  });
  const [error, setError] = useState<string | null>(null);

  if (value === undefined) {
    return (
      <p role="status" className="text-label text-ink-3">
        Loading your settings…
      </p>
    );
  }
  return (
    <section
      aria-labelledby="phone-settings"
      className="grid max-w-2xl gap-4 rounded-xl bg-surface-low p-5 sm:p-6"
    >
      <div className="grid gap-1">
        <h2
          id="phone-settings"
          className="font-display text-title font-medium text-ink"
        >
          On a phone
        </h2>
        <p className="text-label text-ink-2">
          On a phone the Chat is the main view and the Canvas is a tab away.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-label font-medium text-warn">
          {error}
        </p>
      ) : null}
      <ChoiceGroup<Pointing>
        label="Tapping an Item in the Chat"
        description="Your choice, in every Event you're in."
        choices={POINTING_CHOICES}
        value={value ?? "event"}
        onChange={(next) => {
          setError(null);
          setMobilePointing({ value: next === "event" ? null : next }).catch(
            (err: unknown) =>
              setError(
                errorMessage(err, "That setting didn't save. Try again."),
              ),
          );
        }}
        columns={3}
      />
    </section>
  );
}
