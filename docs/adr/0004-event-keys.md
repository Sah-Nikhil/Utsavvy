# Members can attach an Event key, stored encrypted and used for the whole Event

A Member can attach an Event key (an Anthropic, Google or OpenAI API key) to one Event. While it is attached, every Assistant run in that Event uses it, whichever Member asked. So do that Event's helper jobs and image generation. We chose a key per Event, not per Member, because the Chat and Canvas are shared and only one Assistant run happens per Event at a time. A family planning together then gets one predictable Assistant instead of one whose model changes with whoever typed last. Decided in [Which stack do we build on?](https://github.com/Sah-Nikhil/Utsavvy/issues/15).

## Rules

- **Fixed model list per provider.** For example `claude-sonnet-5-5` / `claude-haiku-5-5`, `gemini-3.8-flash` / `gemini-3.5-flash-lite`, `gpt-6.1-sol` / `gpt-6-luna`. The build plan fixes the exact list. Free-text model names are a later idea, not v1 ([Ideas discussion](https://github.com/Sah-Nikhil/Utsavvy/discussions/21)).
- **Stored encrypted.** The key is encrypted with AES-256-GCM before it is written to Convex. The encryption secret lives only in a Convex environment variable. No query ever returns the key: Members see only the provider, the model, who attached it and its last four characters. It is decrypted only inside the server action that calls the model.
- **Checked when saved.** Saving a key makes one small test call, and an invalid key is refused.
- **Removable** at any time, which deletes the stored ciphertext.
- **Falls back when it fails.** If a call fails because of the key (revoked, out of quota, wrong), the Assistant answers with the default model ([ADR 0003](0003-assistant-runs-on-claude-sonnet.md)) and posts a short notice in the Chat that the Event key failed.
- **Image generation only with a capable Event key.** Image generation appears only in Events whose key is Google (`gemini-nano-banana-2.1`) or OpenAI (`gpt-image-2.5-flare`). Without one, Inspirations come from Pexels, uploads and Pinterest or Instagram references.

## Considered options

- **No own keys in v1**: simplest, but leaves no way to get image generation without the app paying for it.
- **Key per Member** (the asker's key pays for their own requests): fair, but the Assistant's model would change from message to message in one shared Chat.
- **The app pays for image generation with a per-Event cap**: rejected for v1.

## Consequences

- Who may attach or remove an Event key is a permission question for [Who can do what on an Event?](https://github.com/Sah-Nikhil/Utsavvy/issues/14).
- How Inspirations get onto the Canvas changes: AI generation and "remix into my theme" exist only with a capable Event key. See [How do Inspirations get onto the Canvas in v1?](https://github.com/Sah-Nikhil/Utsavvy/issues/17).
- Event keys must never appear in logs, error messages, Chat messages or tool results shown to the model.
