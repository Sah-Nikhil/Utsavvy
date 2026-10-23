/** How the composer reads, given what is attached and the Don't reply switch. */
export type ComposerMode = {
  /** Whether sending this message asks Utsavvy for a reply. */
  replies: boolean;
  /** The Don't reply value to send. */
  dontReply: boolean;
  dontReplyDisabled: boolean;
  placeholder: string;
  /** A line under the composer explaining the switch, if needed. */
  note: string | null;
};

/**
 * A message that points at the Canvas always asks Utsavvy (rule 3), so while
 * a selection is attached Don't reply is switched off and disabled, with a
 * line saying why.
 */
export function composerMode(
  hasSelection: boolean,
  dontReply: boolean,
): ComposerMode {
  if (hasSelection) {
    return {
      replies: true,
      dontReply: false,
      dontReplyDisabled: true,
      placeholder: "Ask Utsavvy about the selection…",
      note: "Utsavvy answers messages that point at the Canvas.",
    };
  }
  return {
    replies: !dontReply,
    dontReply,
    dontReplyDisabled: false,
    placeholder: dontReply
      ? "Message the other Members…"
      : "Ask Utsavvy, or tell the Members…",
    note: null,
  };
}
