# The Assistant works on a shared Canvas, not only in a chat

The challenge asks for "a GenAI-powered planning assistant". We read "assistant" as an agent that Members talk to, not as a chat-only interface. Each Event has a Chat, where Members and the Assistant talk, and a Canvas, where the Assistant lays out budgets, timelines, checklists, Vendors and Inspirations and where Members add, edit and Comment. On desktop the Canvas sits beside the Chat. On mobile the Chat is the main view, with a compact Canvas tab.

## Considered options

- **Chat only, with inline cards.** Rejected: the plan ends up scattered across messages, so it can't be glanced at, shared or edited together.
- **Proactive background agent** that reaches out by email or WhatsApp. Rejected for v1: the delivery and scheduling infrastructure doesn't fit a one-week build.

## Consequences

- Two surfaces (Canvas and Chat) have to stay in sync, live, for every Member of an Event.
- The interaction borrows from Google Labs' Play with Putty (select something, tell the AI what to change, shared history) and from Clicky (point at something and ask; the AI points back at what it means).
