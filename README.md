# Thought Box API

An AI-powered second brain API running on **Cloudflare Workers**, built with **Hono**, **Drizzle ORM**, and **D1** (SQLite at the edge).

Thought Box lets users collect small thoughts into **Boxes** and uses AI (via OpenRouter) to transform them into structured documents:

```text
User
 ├── Thoughts
 ├── Boxes
 ├── Tags
 └── AI-generated summaries & documents
```

## Features

- **Users** with email/password registration and JWT login (bearer tokens)
- **Thoughts** with full CRUD, rich metadata (`ai_title`, `ai_summary` placeholders), and `created_at`/`updated_at`
- **Boxes** — user-scoped containers for thoughts (e.g. "Protein TCC", "ESP32 Jarvis")
- **Tags** — many-to-many with thoughts (a thought can belong to multiple topics)
- **AI Generation** — turn a box of thoughts into:
  - a concise **project summary** (markdown, structured sections)
  - a complete **document** (Game Design Document, Research Summary, Product Specification, Technical Architecture, Story Outline — inferred from content)
- Generated documents are **cached per box** and updated in place on regeneration
- Request validation via **Zod**, typed end-to-end with **TypeScript**

## Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Runtime    | Cloudflare Workers                  |
| Framework  | Hono                                |
| Database   | Cloudflare D1 (SQLite)              |
| ORM        | Drizzle ORM + drizzle-kit           |
| Validation | Zod (`@hono/zod-validator`)         |
| Auth       | JWT (HS256) + PBKDF2 password hashing |
| AI         | OpenRouter (`/api/v1/chat/completions`) |

## Setup

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler` or use `npx`)
- An [OpenRouter](https://openrouter.ai/) API key

### 1. Install dependencies

```bash
npm install
```

### 2. Create the D1 database

```bash
npx wrangler d1 create thought_box_db
```

Copy the returned `database_id` into `wrangler.jsonc` (replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`).

### 3. Configure secrets

For local development, copy `.dev.vars.example` to `.dev.vars` and set:

```bash
cp .dev.vars.example .dev.vars
```

- `JWT_SECRET` — a long random string
- `OPENROUTER_API_KEY` — your OpenRouter key (`sk-or-v1-...`)

For production:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put OPENROUTER_API_KEY
```

### 4. Configure the AI model (optional)

The model is configurable via the `AI_MODEL` variable in `wrangler.jsonc` (default: `google/gemma-3-27b-it:free`). Any OpenRouter model id works, e.g. `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`.

### 5. Apply database migrations

```bash
# Local
npm run db:migrate

# Remote (production)
npm run db:migrate:remote
```

### 6. Run locally

```bash
npm run dev
```

The API is available at `http://localhost:8787`.

### 7. Deploy

```bash
npm run deploy
```

## API Reference

All endpoints except `/` and `/auth/*` require an `Authorization: Bearer <token>` header (obtained from `POST /auth/login`).

### Health Check

- `GET /` — returns API status.

### Auth

- `POST /auth/register`
  - Body: `{ "email": string, "password": string }` (password ≥ 8 chars)
  - Response `201`: `{ "id": number, "email": string, "createdAt": string }`
  - Errors: `409` email already registered, `400` validation failure.

- `POST /auth/login`
  - Body: `{ "email": string, "password": string }`
  - Response `200`: `{ "token": string, "tokenType": "Bearer", "userId": number }` (token valid for 24h)
  - Errors: `401` invalid credentials.

### Thoughts

- `POST /thoughts`
  - Body: `{ "content": string, "tagIds"?: number[], "boxIds"?: number[] }`
  - Response `201`: created thought (with `tags` and `boxes`).
  - Errors: `404` referenced tag/box does not exist.

- `GET /thoughts`
  - Query: `tagId?`, `boxId?`, `limit?` (1–100, default 20), `offset?` (default 0)
  - Response `200`: `{ "thoughts": [...] }`

- `GET /thoughts/{id}` — Response `200`: thought with tags and boxes. Errors: `404`.

- `PATCH /thoughts/{id}`
  - Body: any of `{ "content"?, "tagIds"?, "boxIds"? }` (at least one field)
  - Response `200`: updated thought. Errors: `404`.

- `DELETE /thoughts/{id}` — Response `204`. Errors: `404`.

### Tags

- `POST /tags` — Body: `{ "name": string }`. Response `201`. Errors: `409` duplicate.
- `GET /tags` — Response `200`: `{ "tags": [...] }`

### Boxes

- `POST /boxes` — Body: `{ "name": string, "description"?: string }`. Response `201`.
- `GET /boxes` — Response `200`: `{ "boxes": [...] }` (scoped to the authenticated user)

### AI Generation

- `POST /boxes/{id}/generate-summary`
  - Loads every thought in the box, sends them to OpenRouter, and generates a concise structured markdown summary (sections: Overview, Main Ideas, Important Concepts, Open Questions).
  - The result is **cached** in `generated_documents` — regenerating updates the cached summary in place.
  - Response `201`: the generated document (see shape below).
  - Errors: `404` box not found, `400` box has no thoughts, `502` AI provider error, `504` AI timeout.

- `POST /boxes/{id}/generate-document`
  - Loads all thoughts plus the latest cached summary (generating a summary first if none exists) and produces a complete professional document (type inferred from content: GDD, Research Summary, Product Specification, Technical Architecture, Story Outline...).
  - The result is **cached** and updated in place on regeneration.
  - Response `201`: the generated document.
  - Errors: same as generate-summary.

- `GET /boxes/{id}/documents`
  - Returns the cached summary and/or document for the box.
  - Response `200`: `{ "documents": [...] }`. Errors: `404` box not found.

- `GET /documents/{id}`
  - Fetches a single generated document by id.
  - Response `200`: the document. Errors: `404`.

Generated document shape:

```json
{
  "id": 1,
  "boxId": 1,
  "type": "summary",
  "title": "Project Summary",
  "content": "# Project Summary\n\n## Overview\n...",
  "model": "google/gemma-3-27b-it:free",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

## AI Safety & Cost Controls

**Safety** — prompts instruct the model to:
- never invent requirements, facts, or technical decisions
- base every statement only on the provided thoughts
- explicitly output "Insufficient information available." where information is missing

**Cost controls**:
- `max_tokens` limits (summary: 1,000; document: 4,000)
- 30s request timeout
- up to 2 retries with exponential backoff on 429/5xx/network errors
- max 200 thoughts per prompt
- results cached in D1 — regeneration only happens on explicit request

## Data Model

```text
users               id, email (unique), password_hash, created_at
thoughts            id, user_id → users, content, ai_title?, ai_summary?, created_at, updated_at
tags                id, name (unique)
thought_tags        thought_id → thoughts, tag_id → tags          (composite PK)
boxes               id, user_id → users, name, description?, created_at
thought_boxes       thought_id → thoughts, box_id → boxes         (composite PK)
generated_documents id, box_id → boxes, user_id → users, type ('summary'|'document'),
                    title, content, model, created_at, updated_at
                    — UNIQUE(box_id, type): one cached summary + one cached document per box
```

All foreign keys cascade on delete.

## Database Migrations

Migrations live in `drizzle/` and are managed by Drizzle Kit + Wrangler:

```bash
# Generate a new migration after editing src/db/schema.ts
npm run db:generate

# Apply locally / remotely
npm run db:migrate
npm run db:migrate:remote
```

## Project Structure

```text
src/
├── index.ts                 # Hono app entry (middleware, routes, error handling)
├── env.ts                   # Worker bindings typing (DB, JWT_SECRET, OPENROUTER_API_KEY, AI_MODEL)
├── db/
│   ├── schema.ts            # Drizzle schema (users, thoughts, tags, boxes, M2M, generated_documents)
│   └── index.ts             # Drizzle client factory for D1
├── auth/
│   ├── password.ts          # PBKDF2-SHA256 hash/verify (Web Crypto)
│   ├── jwt.ts               # HS256 JWT sign/verify (Web Crypto)
│   └── middleware.ts        # Bearer-token guard, injects userId
├── schemas/                 # Zod request validation schemas
├── services/
│   ├── ai/
│   │   ├── openrouter.ts    # OpenRouter client (timeout, retries, token limits)
│   │   ├── prompts.ts       # Summary & document prompt templates (safety rules)
│   │   └── generator.ts     # Generation orchestration + cache persistence
│   ├── boxService.ts        # Box CRUD
│   ├── thoughtService.ts    # Thought CRUD + associations
│   ├── tagService.ts        # Tag CRUD
│   ├── documentService.ts   # Generated document persistence (upsert cache)
│   ├── userService.ts       # Registration / credential verification
│   └── errors.ts            # Domain errors
└── routes/                  # HTTP route handlers (auth, thoughts, tags, boxes, documents)
```

## Development

```bash
npm run dev         # wrangler dev (local Workers runtime)
npm run typecheck   # tsc --noEmit
npm run db:generate # generate migrations from schema changes
```

## Roadmap

- AI-generated thought titles/summaries (`ai_title`, `ai_summary` fields are ready)
- Embeddings / vector search, knowledge graph, thought relationships

## License

MIT