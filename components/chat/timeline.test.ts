import type { UIMessage } from "@convex-dev/agent/react";
import { describe, expect, it } from "vitest";
import type { ChatDetails, RunSummary } from "./runState";
import {
  buildTimeline,
  historyRange,
  sourceLabel,
  withHistory,
} from "./timeline";

function message(
  id: string,
  order: number,
  role: "user" | "assistant",
  text: string,
  createdAt: number,
): UIMessage {
  return {
    id,
    key: id,
    order,
    stepOrder: role === "user" ? 0 : 1,
    status: "success",
    role,
    text,
    parts: [{ type: "text", text }],
    _creationTime: createdAt,
  } as UIMessage;
}

type Annotation = ChatDetails["annotations"][number];

function annotation(messageId: string, authorName: string): Annotation {
  return {
    _id: `a-${messageId}` as Annotation["_id"],
    _creationTime: 0,
    eventId: "event" as Annotation["eventId"],
    messageId,
    authorMembershipId: "rohan" as Annotation["authorMembershipId"],
    authorName,
    dontReply: false,
    mentions: [],
    pointing: [],
    card: null,
  };
}

function run(id: string, messageId: string, status: RunSummary["status"]) {
  return {
    _id: id as RunSummary["_id"],
    messageId,
    status,
    requestedBy: "rohan" as RunSummary["requestedBy"],
    requestedByName: "Rohan",
    stoppedByName: null,
    model: "",
    createdAt: 0,
    startedAt: null,
    endedAt: null,
  } satisfies RunSummary;
}

const details: ChatDetails = {
  threadId: "thread",
  me: {
    membershipId: "aditi" as ChatDetails["me"]["membershipId"],
    canPost: true,
  },
  annotations: [annotation("new", "Aditi")],
  runs: [run("r-new", "new", "queued")],
  historyFrom: 5_000,
  latestModel: null,
};

const old = message("old", 0, "user", "Who handles the haldi?", 1_000);
const recent = message("new", 1, "user", "Plan the sangeet", 6_000);

describe("older Chat details (L9)", () => {
  it("asks for history from the oldest loaded message to the window's start", () => {
    expect(historyRange([old, recent], details)).toEqual({
      since: 1_000,
      until: 5_000,
    });
  });

  it("asks for nothing when the details already cover every loaded message", () => {
    expect(historyRange([recent], details)).toBeNull();
    expect(historyRange([old], { ...details, historyFrom: null })).toBeNull();
  });

  it("gives an older message its author and run", () => {
    const full = withHistory(details, {
      annotations: [annotation("old", "Rohan"), annotation("new", "Aditi")],
      runs: [run("r-old", "old", "stopped"), run("r-new", "new", "queued")],
    });
    expect(full.annotations.map((a) => a.messageId)).toEqual(["old", "new"]);
    expect(full.runs.map((r) => r._id)).toEqual(["r-old", "r-new"]);
    const [first] = buildTimeline([old, recent], full);
    expect(first).toMatchObject({
      kind: "member",
      annotation: { authorName: "Rohan" },
      run: { status: "stopped" },
    });
  });
});

describe("sourceLabel (L13)", () => {
  it("shows a source's title, or its site", () => {
    expect(sourceLabel({ url: "https://x.in/a", title: "Tent prices" })).toBe(
      "Tent prices",
    );
    expect(sourceLabel({ url: "https://www.x.in/a", title: undefined })).toBe(
      "www.x.in",
    );
  });

  it("shows a malformed URL as it is instead of throwing", () => {
    expect(sourceLabel({ url: "not a url", title: undefined })).toBe(
      "not a url",
    );
  });
});
