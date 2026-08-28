# AI providers

Thought Box uses a provider abstraction so business logic does not depend on a specific AI vendor.

## Provider hierarchy

```text
User
  ↓
Thought Box API
  ↓
AI Provider resolver
  ├── platform → Cloudflare Workers AI (primary)
  │                └── Gemini (standby on Workers AI exhaustion/outage)
  └── byok     → OpenRouter using the user's encrypted key
```

OpenRouter is **not** the platform default. The legacy shared OpenRouter provider remains in the codebase only for compatibility with older direct consumers.

## Cloudflare Workers AI

The Worker declares an `AI` binding in `wrangler.jsonc` and uses:

```text
@cf/qwen/qwen3-30b-a3b-fp8
```

The model is selected through `WORKERS_AI_MODEL`, so it can be benchmarked or replaced without changing the provider abstraction.

Qwen3 30B A3B currently provides a 32,768-token context window. Cloudflare lists it at 4,625 Neurons per million input tokens and 30,475 Neurons per million output tokens. The Workers AI Free allocation is 10,000 Neurons/day, so the allocation is roughly equivalent to 2.16 million input tokens, 328k output tokens, or a mixture of both at the published rates. Actual usage depends on the input/output split.

## Fallback behavior

Workers AI is attempted first for every normal platform request. If Cloudflare returns a rate-limit, access-denied, or server-side failure, the resolver retries the same request once through the direct Gemini provider.

This includes the practical case where the Workers AI Free allocation is exhausted. The fallback is intentionally **Gemini, not OpenRouter**, so the platform path does not silently consume the application's shared OpenRouter quota.

BYOK behavior is unchanged: users with a valid encrypted OpenRouter key continue using their own key. Invalid BYOK credentials are marked invalid and the request falls back to the platform path.

## Configuration

The following Worker variables are configured by `wrangler.jsonc`:

- `WORKERS_AI_MODEL` — primary Workers AI model.
- `GEMINI_MODEL` — Gemini standby model.

Secrets:

```bash
wrangler secret put JWT_SECRET
wrangler secret put GEMINI_API_KEY
wrangler secret put BYOK_KEK_V1
```

`OPENROUTER_API_KEY` remains optional and is not used by the default provider resolver. `OPENROUTER_MODEL` continues to configure the user BYOK path.

For local development, put the required secrets in `.dev.vars`.

## Why Qwen3 30B A3B?

The initial production model was selected from the issue's candidate set because it combines a large effective model capacity with a mixture-of-experts architecture, a 32K context window, reasoning support, and relatively low Neuron consumption. It is a starting point rather than a permanent lock-in; the provider accepts a model override and the deployment model is configurable through `WORKERS_AI_MODEL`.

A future benchmark should compare title generation, summaries, tags, and document synthesis on representative Thought Box prompts and record quality, latency, input/output Neurons, and failure rates before changing the default.
