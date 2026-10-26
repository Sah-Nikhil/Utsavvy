# Who can do what on an Event

Decided in [Who can do what on an Event?](https://github.com/Sah-Nikhil/Utsavvy/issues/14) on 2026-10-21. Planning only: this is the rule set the build follows, not code.

Inputs: [How should the Canvas look and behave on desktop and mobile?](https://github.com/Sah-Nikhil/Utsavvy/issues/11) (the Event's creator controls the starting Sections and the Event defaults), [Which stack do we build on?](https://github.com/Sah-Nikhil/Utsavvy/issues/15) (Clerk sign-in, Event keys in [ADR 0004](../adr/0004-event-keys.md), judge accounts in [ADR 0002](../adr/0002-nextjs-on-vercel-with-convex-and-clerk.md)), [How do Vendors and Listed prices get into v1?](https://github.com/Sah-Nikhil/Utsavvy/issues/16) (who may shortlist, change statuses, refresh Vendors and drag Markers) and [How does the Assistant behave when several Members share a Chat and Canvas?](https://github.com/Sah-Nikhil/Utsavvy/issues/12) (any Member can accept or reject a Proposal and stop a reply).

## Summary

1. **Four roles**: Owner, Co-owner, Member and Viewer. Each person on an Event has exactly one.
2. **Owners and Co-owners are Members; a Viewer is not.** A Viewer sees the Canvas, the Chat and the history live and can Comment, but doesn't plan. Every rule elsewhere that says "any Member can..." therefore excludes Viewers without saying so.
3. **One Owner per Event.** The person who creates the Event is its Owner. An Event never has zero Owners.
4. **Co-owners** can do everything the Owner can, except delete the Event, transfer ownership, and make, unmake or remove Co-owners.
5. **The Owner label is a setting.** The docs and code always say Owner and Co-owner. The UI shows either "Owner" / "Co-owner" or "Host" / "Co-host", picked when the Event is created (default Owner) and changeable later by the Owner or a Co-owner.
6. **Joining**: sign-in is always required. Two invite links (a Member link and a Viewer link) and email invites that pre-approve an address with a role. Utsavvy sends no email in v1.
7. **At most 25 people per Event**, counting the Owner, Co-owners, Members, Viewers and pending email invites.
8. **Leaving and removal** keep everything the person made, under their name. Removed people are blocked from rejoining by link until an Owner or Co-owner unblocks them. The Owner must transfer ownership before leaving.
9. **No public link in v1.** Nothing about an Event is visible without signing in.
10. **Guests never get accounts in v1.** Guests are counted and planned for; they don't sign in.

## Roles

| Role | Is a Member? | In one line |
|---|---|---|
| Owner | Yes | Created the Event (or was handed it). Holds the Event-ending powers. |
| Co-owner | Yes | Runs the Event alongside the Owner: people, Event key, Sections, defaults. |
| Member | Yes | Plans: talks to the Assistant, edits the Canvas, handles Vendors and Quotes. |
| Viewer | No | Looks and Comments. Never edits, never asks the Assistant. |

The UI label for the Owner role is per Event: "Owner" or "Host", and the Co-owner label follows it ("Co-owner" or "Co-host"). Only the label changes; the role and its powers are the same. "Host" is offered because some families prefer it, even though the real-world hosts of a wedding are often the parents rather than whoever opened the app.

## Permissions

"Owner and Co-owners" means either of them can do it. "Any Member" means the Owner, Co-owners and Members, never Viewers.

| Action | Owner | Co-owner | Member | Viewer |
|---|---|---|---|---|
| See the Canvas, the Chat, presence and the edit history | Yes | Yes | Yes | Yes |
| Add, edit and resolve their own Comments | Yes | Yes | Yes | Yes |
| Post in the Chat, ask the Assistant, tap a Nudge to ask about it | Yes | Yes | Yes | No |
| Accept or reject a Proposal, stop the Assistant's reply (as the [Assistant behavior](assistant-behavior.md) allows) | Yes | Yes | Yes | No |
| Edit the Canvas: Items, Entries, positions, the Theme, the Budget total (through a Proposal) | Yes | Yes | Yes | No |
| Create, rename and delete custom Sections | Yes | Yes | Yes | No |
| Rename a starting Section (unless renaming is blocked) | Yes | Yes | Yes | No |
| Shortlist Vendors, set statuses, add Quotes, refresh Vendors, run Discovery, drag Markers | Yes | Yes | Yes | No |
| Restore an earlier value from the edit history | Yes | Yes | Yes | No |
| Leave the Event | After transferring ownership | Yes | Yes | Yes |
| See and copy the invite links, reset either link | Yes | Yes | No | No |
| Add and cancel email invites | Yes | Yes | No | No |
| Switch someone between Member and Viewer | Yes | Yes | No | No |
| Remove a Member or Viewer | Yes | Yes | No | No |
| Unblock a removed person | Yes | Yes | No | No |
| Attach, replace or remove the Event key | Yes | Yes | No | No |
| See the Event key's provider and last four characters | Yes | Yes | No | No |
| Full control of starting Sections, block their renaming | Yes | Yes | No | No |
| Set the Event defaults (Compact view grouping, mobile pointing default) | Yes | Yes | No | No |
| Rename the Event, change the Owner/Host label | Yes | Yes | No | No |
| Make a Member or Viewer a Co-owner, turn a Co-owner back into a Member | Yes | No | No | No |
| Remove a Co-owner | Yes | No | No | No |
| Transfer ownership | Yes | No | No | No |
| Delete the Event | Yes | No | No | No |

Notes:

- The Canvas ticket said "the creator" controls starting Sections and the Event defaults. Those controls belong to the Owner and Co-owners. Each person can still override the mobile pointing default for themselves, and each person's Compact mode order and collapse state stays personal, whatever their role (Viewers included).
- No one can remove, demote or block the Owner. A Co-owner can't remove another Co-owner.
- The Assistant acts for the Member who asked it, so its abilities in a run are that Member's. Since Viewers can't ask, the Assistant never runs on a Viewer's behalf. A Viewer's Comment never triggers an Assistant run, even if it mentions @Utsavvy.
- Every Event-scoped Convex function and Assistant tool checks the caller's role, not only membership ([ADR 0002](../adr/0002-nextjs-on-vercel-with-convex-and-clerk.md) already requires the membership check). Hiding a button is never the only protection.
- Deleting the Event asks the Owner to type its name. It deletes the Event's Canvas, Chat, Shortlisted Vendors, Quotes, uploads and Event key ciphertext. Shared Vendor records stay, since they belong to every Event ([ADR 0008](../adr/0008-vendors-are-one-shared-record.md)).

## Joining

- **Sign-in is required** for every role (Clerk: Google or email + password). There are no anonymous visitors.
- **Two invite links per Event**: a Member link and a Viewer link. Whoever opens one and signs in joins at once with that role. The links never expire. The Owner or a Co-owner can reset either one, which stops the old link working. Co-owner is never given by link, only by the Owner promoting someone already in the Event.
- **Email invites**: the Owner or a Co-owner enters an email address and a role (Member or Viewer). Utsavvy sends nothing. When someone signs in with that address, the Event appears in their list and they hold that role. Pending invites show in the people list with the role and can be cancelled. The person usually hears about it on WhatsApp from whoever invited them. Utsavvy sending the email itself is a later idea ([Ideas discussion](https://github.com/Sah-Nikhil/Utsavvy/discussions/25)).
- **Someone already in the Event** who opens a link keeps their current role. A link never changes a role, in either direction.
- **The cap is 25 people per Event**: Owner, Co-owners, Members, Viewers and pending email invites together. Opening a link to a full Event shows "This Event is full. Ask the Owner to make room." and adding an email invite to a full Event is refused. The cap also keeps one Event from using up the 100 accounts Clerk's development keys allow for the whole app. The cap may be raised later.
- **No public read-only link in v1.** A link that works without signing in is a later idea ([Ideas discussion](https://github.com/Sah-Nikhil/Utsavvy/discussions/26)).

## Leaving and removal

- **Anyone except the Owner can leave** at any time. People who left on their own can rejoin through a link like anyone else.
- **Removing someone** (a Member or Viewer by the Owner or a Co-owner, or a Co-owner by the Owner) takes their access away at once. Their presence dot disappears. A reply the Assistant is streaming for them finishes its text with a short notice, but from the moment of removal it can't read or change anything in the Event for them, and any of their messages still queued are cancelled ([IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) section 4.3).
- **Their work stays.** Notes, Comments, Chat messages, history entries, Quotes and Shortlisted Vendors they added keep their name, shown with a "(left)" tag. The same applies to people who left on their own. Nothing is deleted or reassigned, so the history, Restore and the Assistant's earlier replies keep working.
- **Removed people are blocked.** Opening an invite link shows "You were removed from this Event." The Event's people list has a Blocked section, where the Owner or a Co-owner can unblock someone; after that the person can rejoin by link. An email invite to a blocked address also lifts the block.
- **The Owner must transfer before leaving.** The Owner picks an existing Co-owner or Member, who becomes the Owner. The old Owner becomes a Co-owner and can then leave like anyone else. A transfer to a Viewer isn't offered; promote them first.
- **If the Owner's Clerk account is deleted**, the longest-standing Co-owner becomes the Owner. With no Co-owner, the Event is deleted.

## The Event key and roles

This narrows one line of [ADR 0004](../adr/0004-event-keys.md), which said Members see the key's provider, model, who attached it and its last four characters.

- The Owner and Co-owners attach, replace and remove the Event key, and see its full details: provider, model, who attached it and the last four characters.
- Members and Viewers see the model labelled with the person who attached the key, for example "Rohan's gemini-3.8-flash". They don't see the provider panel or the last four characters. Without an Event key, everyone sees the default model's name.
- The key itself is never shown to anyone, including the person who attached it (unchanged from ADR 0004).
- When the key fails, the Chat notice that the Event key failed and the default model answered is shown to everyone, Viewers included (unchanged from ADR 0004).
- **The person who attached the key decides what happens to it when they go**, because it is their money paying for the Event's replies:
  - **Leaving**: the leave dialog has a "Remove my Event key too" switch, on by default. If it's on, the key is deleted as they leave and the Event goes back to the default model. If it's off, the key stays.
  - **Removed**: the key stays at first. The next time they open Utsavvy they see that they were removed from the Event, with a "Remove my Event key from this Event" button. This is the one thing a removed person can still do to that Event. It works even if they are blocked.
  - Either way, the Chat gets a notice when the key goes ("Rohan's Event key was removed, the Assistant is back on the default model"), and image generation disappears until a new key is attached.
  - A key that stays keeps working, labelled with the person's name and "(left)". The Owner or a Co-owner can still remove it at any time.

## History and attribution

- Everyone, Viewers included, sees the full edit history with names: Members and the Assistant as "Utsavvy for <Member>". Comments are not history rows (decided 2026-10-23, after the review of PR #91): each keeps its author and time in its own thread, and the history covers changes to the plan only (`HISTORY_TABLES` in `lib/types/history.ts`).
- Only Members can press Restore, because Restore is an edit. The same goes for Undo all (X11), which is a Restore of every change in an Assistant reply or accepted Proposal; any Member can press it, not only the one who asked or accepted. Viewers never see the button.
- Role changes, removals, unblocks, ownership transfers, link resets and Event key changes are listed in the history too, with who did them. The key's value never appears there.

## Judge accounts

The seeded demo Event (created by [What is in v1, what is the demo, and what is the build plan?](https://github.com/Sah-Nikhil/Utsavvy/issues/18)) has three ready-made judge accounts:

| Account | Role in the demo Event | Shows |
|---|---|---|
| judge-owner | Owner | Every control: invite links, email invites, blocking, the Event key, Section controls, transfer and delete. |
| judge-member | Member | Normal planning with the Assistant. |
| judge-viewer | Viewer | Look and Comment only, side by side with a Member in a second browser window. |

The judge-owner can delete or transfer the demo Event; the reset script restores it, including the three roles. A judge who signs up fresh with a `+clerk_test` address and creates an Event is that Event's Owner.

## Worked examples

**A wedding.** Meera creates the Event and picks the "Host" label, so the people list shows "Meera (Host)". She posts the Member link in the "Meera weds Rohan" WhatsApp group and the Viewer link in the family elders' group. Rohan and Aditi join as Members; Meera's dad joins as a Viewer. Meera makes Rohan a Co-owner, and the list shows "Rohan (Co-host)".

- Rohan attaches his Google key. Aditi now sees "Rohan's gemini-3.8-flash" as the Assistant's model and image generation appears. Only Meera and Rohan see "Google, attached by Rohan, ending x7Qf".
- Meera's dad Comments on the Venue card: "Is this hall big enough for our relatives from Kota?". He can't ask the Assistant, and the Proposal buttons are not shown to him.
- Aditi wants her sister Isha to help with decor. She can't see the links, so she asks Rohan, who adds an email invite for Isha as a Member. Isha signs in with that address and the Event is waiting for her.
- Rohan wants his brother Kabir as a Co-owner too. He can make Kabir a Member, but only Meera can make him a Co-owner.
- After a family argument, Rohan removes Aditi. Her Notes and Quotes stay, shown as "Aditi (left)". When she opens the old Member link, she sees "You were removed from this Event." A week later Meera unblocks her from the Blocked list and Aditi rejoins through the same link.
- Meera wants to step back. She transfers ownership to Rohan, becomes a Co-owner, and then leaves. Rohan's Google key, the Canvas and the Chat are untouched.
- Had Rohan been the one leaving instead, the leave dialog would offer "Remove my Event key too", on by default. Had Meera removed him, he would see "You were removed from this Event" next time he opened Utsavvy, with a button to remove his key from it.

**A community event.** The Kothrud society's Ganesh utsav committee has 14 people. The secretary creates the Event and sends the Member link to the 5 people doing the planning and the Viewer link to the other 9. The Event holds 14 of its 25 places. When the society's treasurer, already a Viewer, is put in charge of the budget, the secretary switches him to Member.

## Changes to other documents

- `CONTEXT.md`: adds Owner, Co-owner and Viewer, and narrows Member and Event key accordingly.
- [ADR 0004](../adr/0004-event-keys.md): who may attach a key and who sees its details is narrowed as described above. The ADR itself is not edited.
- [docs/design/vendors.md](vendors.md): the open question "who may shortlist, change statuses, refresh Vendors or drag Markers" is answered: any Member.
- The Canvas ticket's "creator" controls belong to the Owner and Co-owners.
