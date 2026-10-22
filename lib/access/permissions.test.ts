import { describe, expect, it } from "vitest";
import { ACTIONS, type Action, type Role } from "../types/roles";
import { can } from "./permissions";

// The permissions table of docs/design/roles.md, transcribed row by row as
// Owner, Co-owner, Member, Viewer ("Y" = Yes). "Leave the Event" is "After
// transferring ownership" for the Owner: the Owner can't leave as Owner.
const ROLES_MD: [Action, string, string, string, string][] = [
  ["canvas.view", "Y", "Y", "Y", "Y"],
  ["comment.add", "Y", "Y", "Y", "Y"],
  ["chat.post", "Y", "Y", "Y", "N"],
  ["proposal.decide", "Y", "Y", "Y", "N"],
  ["canvas.edit", "Y", "Y", "Y", "N"],
  ["section.custom", "Y", "Y", "Y", "N"],
  ["section.renameStarting", "Y", "Y", "Y", "N"],
  ["vendor.manage", "Y", "Y", "Y", "N"],
  ["history.restore", "Y", "Y", "Y", "N"],
  ["event.leave", "N", "Y", "Y", "Y"],
  ["invite.links", "Y", "Y", "N", "N"],
  ["invite.email", "Y", "Y", "N", "N"],
  ["member.switchRole", "Y", "Y", "N", "N"],
  ["member.remove", "Y", "Y", "N", "N"],
  ["member.unblock", "Y", "Y", "N", "N"],
  ["eventKey.manage", "Y", "Y", "N", "N"],
  ["eventKey.view", "Y", "Y", "N", "N"],
  ["section.starting", "Y", "Y", "N", "N"],
  ["event.defaults", "Y", "Y", "N", "N"],
  ["event.rename", "Y", "Y", "N", "N"],
  ["coOwner.make", "Y", "N", "N", "N"],
  ["coOwner.remove", "Y", "N", "N", "N"],
  ["event.transfer", "Y", "N", "N", "N"],
  ["event.delete", "Y", "N", "N", "N"],
];
const ROLE_COLUMNS: Role[] = ["owner", "coOwner", "member", "viewer"];

describe("can(role, action) follows the roles.md permissions table", () => {
  it("covers every action exactly once", () => {
    expect(ROLES_MD.map(([action]) => action).sort()).toEqual(
      [...ACTIONS].sort(),
    );
  });

  const cases = ROLES_MD.flatMap(([action, ...cells]) =>
    ROLE_COLUMNS.map((role, i) => ({
      action,
      role,
      allowed: cells[i] === "Y",
    })),
  );
  it.each(cases)(
    "can($role, $action) is $allowed",
    ({ role, action, allowed }) => {
      expect(can(role, action)).toBe(allowed);
    },
  );

  it("matches the issue's worked examples", () => {
    expect(can("viewer", "comment.add")).toBe(true);
    expect(can("viewer", "chat.post")).toBe(false);
    expect(can("coOwner", "coOwner.make")).toBe(false);
    expect(can("owner", "event.delete")).toBe(true);
  });
});
