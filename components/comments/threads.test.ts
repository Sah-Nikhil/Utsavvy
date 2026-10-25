import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { openCount, threadsOf, type CommentView } from "./threads";

const itemId = "item1" as Id<"items">;
const entryId = "entry1" as Id<"entries">;

function comment(
  id: string,
  over: Partial<CommentView> & Pick<CommentView, "target">,
): CommentView {
  return {
    _id: id as Id<"comments">,
    rootId: null,
    body: id,
    resolved: false,
    createdAt: 0,
    editedAt: null,
    authorName: "Papa",
    authorImageUrl: null,
    byAssistant: false,
    byYou: false,
    canEdit: false,
    canResolve: false,
    entryLabel: null,
    ...over,
  };
}

const onItem = { kind: "item" as const, itemId };
const onEntry = { kind: "entry" as const, itemId, entryId };

const comments: CommentView[] = [
  comment("a", { target: onItem }),
  comment("b", { target: onItem, rootId: "a" as Id<"comments"> }),
  comment("c", { target: onEntry }),
  comment("d", { target: onItem, resolved: true }),
  comment("e", { target: onItem, rootId: "d" as Id<"comments"> }),
];

describe("threadsOf", () => {
  it("puts replies under their first Comment, in order", () => {
    expect(
      threadsOf(comments).map((t) => [
        t.root.body,
        t.replies.map((r) => r.body),
      ]),
    ).toEqual([
      ["a", ["b"]],
      ["c", []],
      ["d", ["e"]],
    ]);
  });
});

describe("openCount", () => {
  it("counts every Comment in open threads on the Item and its Entries", () => {
    expect(openCount(comments)).toBe(3);
  });

  it("counts only the target's open threads", () => {
    expect(openCount(comments, onItem)).toBe(2);
    expect(openCount(comments, onEntry)).toBe(1);
  });
});

describe("COMMENT_MAX", () => {
  it("matches the server's limit", async () => {
    const server = await import("@/convex/comments");
    const client = await import("./CommentComposer");
    expect(client.COMMENT_MAX).toBe(server.COMMENT_MAX);
  });
});
