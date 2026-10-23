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

export function composerMode(
  hasSelection: boolean,
  dontReply: boolean,
): ComposerMode {
  return {
    replies: hasSelection || !dontReply,
    dontReply,
    dontReplyDisabled: false,
    placeholder: dontReply
      ? "Message the other Members…"
      : "Ask Utsavvy, or tell the Members…",
    note: null,
  };
}
