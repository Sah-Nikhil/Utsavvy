---
id: 10
title: Which stack do we build on?
labels: [wayfinder:grilling]
status: open
assignee:
parent: 1
blocked_by: [2, 4, 5, 15]
---

> **Archived.** This ticket moved to GitHub on 2026-10-21: https://github.com/Sah-Nikhil/Utsavvy/issues/15. Edit it there; this file is no longer updated.

## Question

Which stack do we build on: framework and hosting, backend and real-time layer, sign-in, file storage, LLM and agent framework, and map library and tiles? Record the choices that carry lock-in as ADRs.

Also decide which AI providers the Assistant supports in v1 (Claude, Gemini, OpenAI), which base model everyone gets without a key of their own, and whether Members can bring their own API key (and if so, how keys are stored safely).

Inputs: [Which backend gives live Chat and Canvas updates, presence and sign-in for a one-week build?](./004-realtime-backend.md), [Which LLM and agent tooling should the Assistant run on?](./005-llm-and-agent-tooling.md), the search and geocoding options in [Which search and geocoding services can power live Vendor discovery?](./015-search-and-geocoding-services.md), and the map terms in [Where can Vendor locations and Listed prices for Indian venues legally come from?](./002-vendor-data-sources.md).

## Comments

### 2026-10-21 Sah-Nikhil

Raised during charting: could the Assistant run on a Claude subscription, the way T3 Code uses one locally?

- **Not through subscription login.** The Agent SDK docs say: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods described in the Quickstart instead." ([source](https://code.claude.com/docs/en/agent-sdk/overview)) T3 Code is different: it runs on your own machine for your own use. A deployed app serving Members and judges is a product.
- **Legitimate route: an API key paid by the Max plan's monthly API credits.** Anthropic gives Max 5x subscribers $100 and Max 20x subscribers $200 in API credits a month, usable on any model ([source](https://www.anthropic.com/claude-haiku-5-5)). These are billed separately from the subscription's chat and Claude Code limits, so they don't eat into build capacity.
- **Fit**: `claude-haiku-5-5` ($0.10 / $0.50 per 1M tokens) costs about $1.60 for the 2,000-turn estimate in [Which LLM and agent tooling should the Assistant run on?](./005-llm-and-agent-tooling.md); `claude-sonnet-5-5` ($2 / $10) about $32. Both fit inside the credits. Claude doesn't generate images and has no Google Maps grounding, so image generation (and any Maps grounding) would still need Gemini. AI SDK 7 and the Convex Agent component support Anthropic as a provider.
- To decide here: which Max plan is on which account, and Claude vs Gemini (or Claude for the Assistant, Gemini for images).

### 2026-10-21 Sah-Nikhil

Clarified: the idea was each Member bringing their own Claude subscription (as T3 Code users do), not the developer's.

- A web app letting Members sign in with their Claude account to power the Assistant is exactly "offer claude.ai login ... for their products", which the Agent SDK note above rules out without Anthropic's approval. T3 Code works differently: it runs the user's own locally installed Claude Code on their own machine, and a hosted web app can't do that.
- What is allowed is "bring your own API key". It doesn't fit this audience (families and committees planning events, and the judges, won't have Anthropic API keys), so at most it's an optional setting, not v1.

### 2026-10-21 Sah-Nikhil

Recommendation updated after the live Vendor discovery decision (see the latest comment on [How do Vendors and Listed prices get into v1?](./011-vendors-and-listed-prices-v1.md)): run the Assistant on **`claude-sonnet-5-5`** through an API key paid by the Max plan's API credits, with Claude's web search and web fetch tools for live Vendor discovery, and use Gemini only for image generation and remixing. Why: Gemini's Search grounding terms forbid analyzing grounded results or following their links automatically, which is exactly what building Vendor cards needs; Claude's web search has no such restriction, and the credits cover the cost. `claude-haiku-5-5` can take cheap, narrow jobs (summaries, extraction) after a quality check. Needs confirming: which Max plan (5x or 20x) is on the account whose credits pay for it.

### 2026-10-21 Sah-Nikhil

Update after [Which search and geocoding services can power live Vendor discovery?](./015-search-and-geocoding-services.md): Vendor discovery now runs on Serper plus our own fetch, so it no longer depends on the LLM provider. The earlier reason for preferring Claude (its web search tool) falls away. Choosing the base model is back to cost and quality: `claude-sonnet-5-5` paid by Max API credits if they cover it, otherwise `gemini-3.8-flash`. Gemini stays the image model either way.

