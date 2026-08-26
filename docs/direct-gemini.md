# Direct Gemini API

Thought Box now uses the Google Gemini API directly as its default platform AI provider.

## Configuration

Set the platform key as a Cloudflare Worker secret:

```bash
npx wrangler secret put GEMINI_API_KEY
```

The model is configured in `wrangler.jsonc` through `GEMINI_MODEL`:

```jsonc
"vars": {
  "GEMINI_MODEL": "gemini-3.7-flash"
}
```

For local development, put `GEMINI_API_KEY` in `.dev.vars`.

## Provider behavior

- Normal platform generations go directly to Google's Gemini Interactions API.
- `UserOpenRouterProvider` remains available for the existing OpenRouter BYOK flow.
- A user's invalid/missing BYOK configuration falls back to the platform Gemini provider.
- 401/403 from a user's OpenRouter BYOK key still marks that key invalid and retries once on platform Gemini.
- 429, 5xx, timeout, and network failures are not silently switched to another provider.

## API details

The Worker sends requests to:

`https://generativelanguage.googleapis.com/v1beta/interactions`

using the `x-goog-api-key` header. Requests use `store: false` because Thought Box already stores generated documents in D1 and does not need Gemini-side conversation persistence for the current synthesis workflow.

The provider uses `generation_config.max_output_tokens` and a temperature of `0.3`, matching the existing synthesis behavior as closely as possible.
