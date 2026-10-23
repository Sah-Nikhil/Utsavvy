import type { UIMessage } from "@convex-dev/agent/react";
import { describe, expect, it } from "vitest";
import { announce, type AnnouncerState } from "./announcer";

function reply(
  id: string,
  order: number,
  status: UIMessage["status"] = "success",
): UIMessage {
  return {
    id,
    key: id,
    order,
    stepOrder: 1,
    status,
    role: "assistant",
    text: `Reply ${id}`,
    parts: [],
    _creationTime: order,
  } as UIMessage;
}

/** Runs the announcer over successive renders; returns what each announced. */
function play(
  renders: { messages: UIMessage[]; loading: boolean }[],
): (string | null)[] {
  let state: AnnouncerState = null;
  return renders.map(({ messages, loading }) => {
    const result = announce(state, messages, loading);
    state = result.state;
    return result.latest?.id ?? null;
  });
}

describe("the reply announcer (L6)", () => {
  it("announces nothing already in the Chat when it opens", () => {
    expect(
      play([
        { messages: [], loading: true },
        { messages: [reply("a", 1), reply("b", 2)], loading: false },
      ]),
    ).toEqual([null, null]);
  });

  it("announces a reply that finishes after the Chat opened", () => {
    expect(
      play([
        { messages: [], loading: true },
        { messages: [reply("a", 1)], loading: false },
        {
          messages: [reply("a", 1), reply("b", 2, "streaming")],
          loading: false,
        },
        { messages: [reply("a", 1), reply("b", 2)], loading: false },
      ]),
    ).toEqual([null, null, null, "b"]);
  });

  it("announces a reply that was streaming when the Chat opened, once it ends", () => {
    expect(
      play([
        {
          messages: [reply("a", 1), reply("b", 2, "streaming")],
          loading: false,
        },
        { messages: [reply("a", 1), reply("b", 2)], loading: false },
      ]),
    ).toEqual([null, "b"]);
  });

  it("doesn't announce older replies loaded with Show earlier messages", () => {
    expect(
      play([
        { messages: [reply("c", 5)], loading: false },
        {
          messages: [reply("a", 1), reply("b", 2), reply("c", 5)],
          loading: false,
        },
      ]),
    ).toEqual([null, null]);
  });
});
