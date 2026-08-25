# AI concierge implementation notes

## Added
- AI相談 section and quick navigation entry.
- Suggested questions + free-text question.
- First-use consent notice.
- 3 successful AI requests per device per UTC day (best-effort client limit).
- Only a summarized calculation snapshot is sent; raw saved input objects are not sent.
- Same-origin `/api/ai` Vercel function proxies to the Cloudflare Worker, so the browser does not call the Worker directly.
- AI cannot write to localStorage or change user settings.
- The prompt explicitly treats the app calculation engine as authoritative and forbids inventing hypothetical numeric results.

## Current scope
This is the safe first-stage AI concierge. It can explain/analyze current app-calculated results and answer general usage/calculation-principle questions. It does NOT yet automatically execute hypothetical scenario changes or apply settings.

## Cloudflare Worker
The deployed Worker `lifeplan-ai` should remain Active with the Workers AI binding named `AI` and model `@cf/google/gemma-4-26b-a4b-it`.

The file `cloudflare/lifeplan-ai-worker.js` is the recommended source for the Worker. It keeps the same Binding name (`AI`) and strengthens the system instruction.

## Quotas
For a hard per-user quota across devices/serverless instances, add a Cloudflare-side durable quota store or rate-limit binding. The current per-device limit is intentionally best-effort; the Workers Free daily quota remains the hard cost ceiling.
