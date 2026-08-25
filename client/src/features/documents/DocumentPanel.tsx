import { useEffect, useState } from "react";
import { useDocuments, useGeneration } from "../../hooks/useDocuments";
import { Markdown } from "../../lib/markdown";
import { EmptyState, ErrorBanner } from "../../components/Feedback";
import { ApiError } from "../../services/api";

/** Document synthesis cooldown (mirrors the backend's 1h limit). */
const COOLDOWN_MS = 60 * 60 * 1_000;

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Right column of the box view: the synthesized document + cooldown-aware
 * "Synthesize" button. The summary resume lives in the page header instead.
 */
export function DocumentPanel({ boxId }: { boxId: number }) {
  const docsQuery = useDocuments(boxId);
  const { document: synth, isGenerating } = useGeneration(boxId);

  const [now, setNow] = useState(() => Date.now());

  const rawDocs = docsQuery.data ?? [];
  const doc = rawDocs.find((d) => d.type === "document");
  const lastSynth = doc ? new Date(doc.updatedAt).getTime() : 0;
  const remaining = lastSynth + COOLDOWN_MS - now;
  const onCooldown = remaining > 0;
  const minutesLeft = Math.max(1, Math.ceil(remaining / 60_000));

  // Keep the countdown ticking while on cooldown.
  useEffect(() => {
    if (!onCooldown) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [onCooldown]);

  const error = synth.error instanceof ApiError ? synth.error.message : null;

  const buttonLabel = isGenerating
    ? "Synthesizing…"
    : onCooldown
      ? `Synthesize · ${minutesLeft}m`
      : doc
        ? "Re-synthesize"
        : "Synthesize";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <div className="px-4 pt-3">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Toolbar: cooldown hint + synthesize button */}
      <div className="flex items-center justify-end gap-3 border-b border-neutral-200 bg-white px-4 py-2">
        {onCooldown && (
          <span className="text-xs text-neutral-400">Available in {minutesLeft} min</span>
        )}
        <button
          type="button"
          onClick={() => synth.mutate()}
          disabled={isGenerating || onCooldown || docsQuery.isPending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buttonLabel}
        </button>
      </div>

      {/* Rendered markdown document */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {docsQuery.isPending ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : isGenerating && !doc ? (
          <p className="text-sm text-neutral-400">Synthesizing…</p>
        ) : doc ? (
          <article className="mx-auto max-w-3xl rounded-lg border border-neutral-200 bg-white p-5 shadow-sm md:p-8">
            <Markdown content={doc.content} />
            <footer className="mt-8 border-t border-neutral-100 pt-3 text-[11px] text-neutral-400">
              Synthesized {formatTime(doc.updatedAt)} · {doc.model}
            </footer>
          </article>
        ) : (
          <EmptyState
            title="No synthesized document yet."
            hint='Click "Synthesize" to connect your thoughts into a structured project summary.'
          />
        )}
      </div>
    </div>
  );
}