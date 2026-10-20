# The Assistant runs on Claude Sonnet 5.5 by default, through AI SDK 7 and the Convex Agent

Every Event's Assistant runs on `claude-sonnet-5-5` unless the Event has an Event key (see [ADR 0004](0004-event-keys.md)). The Anthropic API key belongs to a Claude Console organization linked to the developer's Claude Max 5x plan on the CC_Alt account, whose monthly API credits ($100) pay for it. When those credits run out, requests stop instead of being billed. Cheap narrow jobs (summaries, extraction, theme JSON) use `claude-haiku-5-5` on the same key. The research in [Which LLM and agent tooling should the Assistant run on?](https://github.com/Sah-Nikhil/Utsavvy/issues/10) recommended `gemini-3.8-flash`, so this choice needs explaining: the credits already cover the estimated 2,000 development and demo turns (about $32 to $55 on Sonnet) with room to spare. That leaves Sonnet's per-token price irrelevant for v1. Gemini's free tier, by contrast, has unpublished rate limits and lets Google use free-tier content to improve its products. Decided in [Which stack do we build on?](https://github.com/Sah-Nikhil/Utsavvy/issues/15).

The agent framework is Vercel AI SDK 7 wrapped by the Convex Agent component (`@convex-dev/agent`), which persists each Event's thread and streams the reply to every Member. AI SDK's provider packages (`@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`) let the model be chosen per run, so the default model name is a setting, not code.

## Considered options

- **`gemini-3.8-flash` as the default**: cheaper per token, but it depends on free-tier limits nobody has verified. It stays wired as the fallback.
- **`claude-haiku-5-5` as the default**: about $1.60 for 2,000 turns, but untested on multi-step Canvas planning.
- **Members signing in with their own Claude subscription**: Anthropic doesn't allow third-party products to offer claude.ai login, so it is ruled out. Members can attach an Event key instead.
- **Google ADK or LangGraph**: these add orchestration this single-agent product doesn't need.

## Consequences

- **`gemini-3.8-flash` is the fallback default model**, switched by changing the setting, if the credits run out or the scripted quality cases favor it. That needs a Gemini key in the app's environment as well.
- Claude doesn't generate images, so the default model has no image generation. Image generation appears only in Events whose Event key can do it (ADR 0004).
- Run the 20 to 30 scripted test cases from the LLM research before changing the default model.

## Sources

Checked 2026-10-21: [Max plan API credits](https://www.anthropic.com/claude-haiku-5-5) ("Max 5x users will get $100 in credits per month"), [credits help article](https://support.claude.com/en/articles/17154008) (credits don't roll over; "API requests stop until your next monthly credits arrive"), [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms) (permission "to power products and services Customer makes available to its own customers and end users"), [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) (no claude.ai login in third-party products), [Convex Agent](https://docs.convex.dev/agents/streaming), [AI SDK 7](https://vercel.com/changelog/ai-sdk-7), research branch `research/llm-agent`.
