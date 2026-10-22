import { v, type Infer } from "convex/values";

/**
 * Who made a change (IMPLEMENTATION_PLAN.md section 4.4). A Member acting
 * directly, or the Assistant acting for the Member it is answering ("Utsavvy for
 * Meera"), possibly through a Proposal another Member accepted ("Utsavvy for
 * Rohan, accepted by Aditi").
 */
export const memberActorValidator = v.object({
  kind: v.literal("member"),
  membershipId: v.id("memberships"),
});
export const assistantActorValidator = v.object({
  kind: v.literal("assistant"),
  forMembershipId: v.id("memberships"),
  runId: v.union(v.id("runs"), v.null()),
  proposalId: v.union(v.id("proposals"), v.null()),
  acceptedBy: v.union(v.id("memberships"), v.null()),
});
export const actorValidator = v.union(
  memberActorValidator,
  assistantActorValidator,
);

export type MemberActor = Infer<typeof memberActorValidator>;
export type AssistantActor = Infer<typeof assistantActorValidator>;
export type Actor = Infer<typeof actorValidator>;
