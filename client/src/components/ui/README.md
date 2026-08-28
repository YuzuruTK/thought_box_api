# UI Design System

Semantic design tokens and primitives introduced by [Issue #23](https://github.com/YuzuruTK/thought_box_api/issues/23). They decouple components from concrete colors so dark mode (#22) and future themes become CSS-variable swaps instead of component rewrites.

## Tokens

Defined in `client/src/index.css` via Tailwind v4 `@theme`. Each token maps to one concrete color today.

| Token | Value today | Utility examples |
| --- | --- | --- |
| `surface` | white | `bg-surface` |
| `surface-muted` | neutral-50 | page background, `hover:bg-surface-muted` |
| `surface-subtle` | neutral-100 | hover fills, markdown `pre`/`code` |
| `foreground` | neutral-900 | headings, body text |
| `foreground-muted` | neutral-500 | labels, hints, meta, placeholders |
| `foreground-faint` | neutral-300 | hover-reveal delete icons, "empty" italics |
| `border` | neutral-200 | all borders, incl. dashed |
| `primary` / `primary-hover` / `primary-foreground` | neutral-900 / neutral-700 / white | primary buttons, active toggle |
| `danger` / `danger-muted` | red-700 / red-500 | error text, destructive hover |
| `danger-surface` / `danger-border` | red-50 / red-200 | error banners |
| `info` | blue-600 | markdown links |

Note: the original palette's neutral 400/600 are merged into `foreground-muted` and 100/300 borders into `border` — sub-perceptual changes accepted in exchange for a small vocabulary.

## Rules

1. **Feature code must not use raw palette utilities** (`bg-white`, `text-neutral-*`, `border-red-*`, …). Use tokens or primitives only.
2. **No new tokens without a real, verified need.**
3. **Primitives only for recurring, real patterns** — no speculative components. Current set: `Button`, `Input`, `Card`, `Alert` (plus `EmptyState`/`ErrorBanner` in `Feedback.tsx`). Modal/Textarea/Badge are added when a consumer exists.
4. Tokens are defined once; themes re-point variables — components never change.

## Enforcement gate

The only allowed raw-palette references are the token definitions in `index.css`. Verify with:

```sh
grep -rnE '(bg|text|border|ring|placeholder)-(white|black|neutral|red|blue|green|slate|gray|zinc)' client/src --include='*.tsx' --include='*.ts'
```

This must return **no matches** in `.tsx`/`.ts` files.
