"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Check,
  Copy,
  Crown,
  Eye,
  MoreHorizontal,
  RotateCcw,
  ShieldCheck,
  UserMinus,
  UserRoundPen,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_PEOPLE_PER_EVENT } from "@/convex/lib/settings";
import type { InviteRole, Role } from "@/lib/types/roles";
import { ConfirmDialog } from "./ConfirmDialog";
import { roleGroupLabel, roleLabel, type OwnerLabel } from "./labels";
import { useMembership, type Membership } from "./useMembership";

// S1 (Events, invite links and the four roles) owns this folder.

export type PeoplePanelProps = { eventId: string };

type Person = FunctionReturnType<typeof api.people.list>["people"][number];
type ActiveMembership = Extract<Membership, { status: "active" }>;

const ACTIVE_ROLES: readonly Role[] = ["owner", "coOwner", "member", "viewer"];

/**
 * The people panel (roles.md): everyone by role with the Owner or Host label,
 * people who left tagged "(left)", and for the Owner and Co-owners the invite
 * links with copy and reset, each person's role and removal controls, and the
 * Blocked section.
 */
export function PeoplePanel({ eventId }: PeoplePanelProps) {
  const me = useMembership(eventId);
  if (me === undefined) {
    return <p className="text-label text-ink-3">Loading people…</p>;
  }
  if (me.status === "denied") {
    return (
      <p className="text-label text-ink-2">
        You&apos;re not in this Event, so its people aren&apos;t shown.
      </p>
    );
  }
  return <People me={me} />;
}

function People({ me }: { me: ActiveMembership }) {
  const data = useQuery(api.people.list, { eventId: me.eventId });
  if (data === undefined) {
    return <p className="text-label text-ink-3">Loading people…</p>;
  }
  const { ownerLabel, people } = data;
  const active = people.filter((p) => p.status === "active");
  const left = people.filter(
    (p) => p.status === "left" || (p.status === "removed" && !p.blocked),
  );
  const blocked = people.filter((p) => p.status === "removed" && p.blocked);

  return (
    <div className="grid gap-6">
      {me.can("invite.links") ? <InviteLinks eventId={me.eventId} /> : null}

      <section aria-labelledby="people-heading" className="grid gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3
            id="people-heading"
            className="font-display text-title font-semibold text-ink"
          >
            Everyone
          </h3>
          <span className="text-caption text-ink-3 num">
            {active.length} of {MAX_PEOPLE_PER_EVENT} places
          </span>
        </div>
        {ACTIVE_ROLES.map((role) => {
          const group = active.filter((p) => p.role === role);
          if (group.length === 0) return null;
          return (
            <PeopleGroup
              key={role}
              title={roleGroupLabel(role, ownerLabel)}
              people={group}
              me={me}
              ownerLabel={ownerLabel}
            />
          );
        })}
        {left.length > 0 ? (
          <PeopleGroup
            title="Left"
            people={left}
            me={me}
            ownerLabel={ownerLabel}
          />
        ) : null}
        {blocked.length > 0 && me.can("member.unblock") ? (
          <PeopleGroup
            title="Blocked"
            description="Removed and can't rejoin by link until someone unblocks them."
            people={blocked}
            me={me}
            ownerLabel={ownerLabel}
          />
        ) : null}
      </section>

      <LeaveEvent me={me} ownerLabel={ownerLabel} />
    </div>
  );
}

function PeopleGroup({
  title,
  description,
  people,
  me,
  ownerLabel,
}: {
  title: string;
  description?: string;
  people: Person[];
  me: ActiveMembership;
  ownerLabel: OwnerLabel;
}) {
  return (
    <div className="grid gap-1.5">
      <div>
        <h4 className="text-caption font-semibold tracking-[0.02em] text-ink-3 uppercase">
          {title}
        </h4>
        {description ? (
          <p className="text-caption text-ink-3">{description}</p>
        ) : null}
      </div>
      <ul aria-label={title} className="grid">
        {people.map((person) => (
          <PersonRow
            key={person.membershipId}
            person={person}
            me={me}
            ownerLabel={ownerLabel}
          />
        ))}
      </ul>
    </div>
  );
}

function PersonRow({
  person,
  me,
  ownerLabel,
}: {
  person: Person;
  me: ActiveMembership;
  ownerLabel: OwnerLabel;
}) {
  const isActive = person.status === "active";
  return (
    <li
      data-person={person.name}
      className="flex min-h-12 items-center gap-3 border-b border-rule py-2 last:border-b-0"
    >
      <Avatar name={person.name} src={person.imageUrl ?? undefined} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-ink">
          {person.name}
          {isActive ? (
            <span className="text-ink-3">
              {" "}
              ({roleLabel(person.role, ownerLabel)})
            </span>
          ) : (
            <span className="text-ink-3">
              {person.blocked ? " (removed)" : " (left)"}
            </span>
          )}
        </p>
        {person.isMe ? <p className="text-caption text-ink-3">You</p> : null}
      </div>
      <PersonActions person={person} me={me} ownerLabel={ownerLabel} />
    </li>
  );
}

/**
 * The role, removal and unblock controls one person gets, from the
 * permissions table: Member and Viewer switches and removals for the Owner and
 * Co-owners; making, unmaking and removing Co-owners for the Owner alone;
 * nothing for the Owner's own row.
 */
function PersonActions({
  person,
  me,
  ownerLabel,
}: {
  person: Person;
  me: ActiveMembership;
  ownerLabel: OwnerLabel;
}) {
  const setRole = useMutation(api.people.setRole);
  const remove = useMutation(api.people.remove);
  const unblock = useMutation(api.people.unblock);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const args = { eventId: me.eventId, membershipId: person.membershipId };

  const run = (change: Promise<unknown>) => {
    setError(null);
    change.catch(() =>
      setError("That didn't work. Their role may have just changed."),
    );
  };

  if (person.status === "removed" && person.blocked) {
    if (!me.can("member.unblock")) return null;
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => run(unblock(args))}
        aria-label={`Unblock ${person.name}`}
      >
        <Undo2 aria-hidden />
        Unblock
      </Button>
    );
  }
  if (person.status !== "active" || person.role === "owner" || person.isMe) {
    return null;
  }

  const coOwner = roleLabel("coOwner", ownerLabel);
  const items: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
  }[] = [];
  if (person.role === "coOwner") {
    if (me.can("coOwner.make")) {
      items.push({
        label: "Make Member",
        icon: <UserRoundPen />,
        onClick: () => run(setRole({ ...args, role: "member" })),
      });
    }
  } else {
    if (me.can("member.switchRole")) {
      items.push(
        person.role === "member"
          ? {
              label: "Make Viewer",
              icon: <Eye />,
              onClick: () => run(setRole({ ...args, role: "viewer" })),
            }
          : {
              label: "Make Member",
              icon: <UserRoundPen />,
              onClick: () => run(setRole({ ...args, role: "member" })),
            },
      );
    }
    if (me.can("coOwner.make")) {
      items.push({
        label: `Make ${coOwner}`,
        icon: person.role === "viewer" ? <ShieldCheck /> : <Crown />,
        onClick: () => run(setRole({ ...args, role: "coOwner" })),
      });
    }
  }
  const canRemove = me.can(
    person.role === "coOwner" ? "coOwner.remove" : "member.remove",
  );
  if (items.length === 0 && !canRemove) return null;

  return (
    <>
      {error ? (
        <span role="alert" className="max-w-32 text-caption text-warn">
          {error}
        </span>
      ) : null}
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="text"
              size="sm"
              icon
              aria-label={`Change ${person.name}'s role or remove them`}
            />
          }
        >
          <MoreHorizontal aria-hidden />
        </MenuTrigger>
        <MenuContent align="end">
          {items.map((item) => (
            <MenuItem key={item.label} icon={item.icon} onClick={item.onClick}>
              {item.label}
            </MenuItem>
          ))}
          {canRemove ? (
            <>
              {items.length > 0 ? <MenuSeparator /> : null}
              <MenuItem
                tone="danger"
                icon={<UserMinus />}
                onClick={() => setConfirmRemove(true)}
              >
                Remove from Event
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${person.name}?`}
        description={`Their access ends now and they can't rejoin by link until the ${roleLabel("owner", ownerLabel)} or a ${coOwner} unblocks them. Everything they added stays, under their name.`}
        confirmLabel="Remove"
        onConfirm={async () => {
          await remove(args);
        }}
      />
    </>
  );
}

const LINK_ROLES: readonly {
  role: InviteRole;
  title: string;
  description: string;
}[] = [
  {
    role: "member",
    title: "Member link",
    description:
      "Joins as a Member: plans with the Assistant and edits the Canvas.",
  },
  {
    role: "viewer",
    title: "Viewer link",
    description: "Joins as a Viewer: looks and Comments, never edits.",
  },
];

/** The two invite links with copy and reset: shown to the Owner and Co-owners only. */
function InviteLinks({ eventId }: { eventId: Id<"events"> }) {
  const links = useQuery(api.people.links, { eventId });
  return (
    <section aria-labelledby="links-heading" className="grid gap-3">
      <div>
        <h3
          id="links-heading"
          className="font-display text-title font-semibold text-ink"
        >
          Invite links
        </h3>
        <p className="text-caption text-ink-2">
          Anyone who opens a link and signs in joins at once. Share them where
          your family plans, for example a WhatsApp group.
        </p>
      </div>
      {LINK_ROLES.map((link) => (
        <InviteLink
          key={link.role}
          eventId={eventId}
          role={link.role}
          title={link.title}
          description={link.description}
          token={links?.[link.role]}
        />
      ))}
    </section>
  );
}

function InviteLink({
  eventId,
  role,
  title,
  description,
  token,
}: {
  eventId: Id<"events">;
  role: InviteRole;
  title: string;
  description: string;
  token: string | undefined;
}) {
  const resetLink = useMutation(api.people.resetLink);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const addressRef = useRef<HTMLInputElement>(null);
  const url =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/join/${token}`
      : "";

  async function copy() {
    if (!url) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (permission, or not a secure context): select the
      // address so the person can copy it themselves.
      setCopyFailed(true);
      addressRef.current?.focus();
      addressRef.current?.select();
    }
  }

  return (
    <div
      data-invite-link={role}
      className="grid gap-2 rounded-md border border-item-line bg-surface px-3 py-3"
    >
      <div>
        <p className="text-label font-semibold text-ink">{title}</p>
        <p className="text-caption text-ink-2">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={addressRef}
          readOnly
          value={url}
          aria-label={`${title} address`}
          onFocus={(e) => e.currentTarget.select()}
          className="h-8 min-w-0 flex-1 truncate rounded-xs border border-rule bg-surface-sunk px-2 text-caption text-ink-2 focus-visible:border-action focus-visible:outline-none"
        />
        <Button
          variant="tonal"
          size="sm"
          onClick={copy}
          disabled={!url}
          aria-label={`Copy the ${title}`}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          variant="text"
          size="sm"
          onClick={() => setConfirmReset(true)}
          aria-label={`Reset the ${title}`}
        >
          <RotateCcw aria-hidden />
          Reset
        </Button>
      </div>
      {copyFailed ? (
        <p role="alert" className="text-caption text-warn">
          Your browser didn&apos;t allow copying. The address is selected: press
          Ctrl+C (or long-press and Copy) to copy it.
        </p>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {copied ? `${title} copied` : ""}
      </span>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={`Reset the ${title}?`}
        description="The old link stops working at once. Everyone already in the Event keeps their place; share the new link with anyone still to join."
        confirmLabel="Reset link"
        onConfirm={async () => {
          await resetLink({ eventId, role });
        }}
      />
    </div>
  );
}

/** Leaving: anyone but the Owner, who hands the Event to someone else first. */
function LeaveEvent({
  me,
  ownerLabel,
}: {
  me: ActiveMembership;
  ownerLabel: OwnerLabel;
}) {
  const router = useRouter();
  const leave = useMutation(api.people.leave);
  const [confirm, setConfirm] = useState(false);

  if (!me.can("event.leave")) {
    return (
      <p className="border-t border-rule pt-4 text-caption text-ink-3">
        As the {roleLabel("owner", ownerLabel)}, you can leave once you&apos;ve
        handed the Event to someone else.
      </p>
    );
  }
  return (
    <div className="border-t border-rule pt-4">
      <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
        Leave this Event
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Leave this Event?"
        description="You lose access now. Everything you added stays, shown with “(left)”, and you can come back through an invite link."
        confirmLabel="Leave"
        onConfirm={async () => {
          await leave({ eventId: me.eventId });
          router.push("/events");
        }}
      />
    </div>
  );
}
