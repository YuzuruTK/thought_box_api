import { useEffect, useState } from "react";
import { useDocuments, useSynthesize } from "../../hooks/useDocuments";
import { Markdown } from "../../lib/markdown";
import { EmptyState, ErrorBanner } from "../../components/Feedback";
import { Button } from "../../components/ui/Button";
import { ApiError } from "../../services/api";
import { formatTime } from "../../lib/dates";
import { formatNumber } from "../../lib/numbers";
import { useAppTranslation } from "../../hooks/useAppTranslation";

/** Manual synthesis cooldown (mirrors the backend's 30-minute limit). */
const COOLDOWN_MS = 30 * 60 * 1_000;

/**
 * Right column of the box view: the synthesized output — a short resume on
 * top (which doubles as the box's distilled summary) followed by the
 * structured document. Includes a cooldown-aware "Synthesize" button.
 */
export function DocumentPanel({ boxId }: { boxId: number }) {
  const docsQuery = useDocuments(boxId);
  const synth = useSynthesize(boxId);
  const { t } = useAppTranslation();

  const [now, setNow] = useState(() => Date.now());

  const rawDocs = docsQuery.data ?? [];
  const doc = rawDocs.find((d) => d.type === "document");
  const summaryResume = rawDocs.find((d) => d.type === "summary");

  // Cooldown is driven by the most recent regeneration (either row).
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
  const isGenerating = synth.isPending;

  const buttonLabel = isGenerating
    ? t("documents.synthesizing")
    : onCooldown
      ? t("documents.cooldownButton", { minutes: minutesLeft, formattedMinutes: formatNumber(minutesLeft) })
      : doc
        ? t("documents.resynthesize")
        : t("documents.synthesize");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <div className="px-4 pt-3">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Toolbar: cooldown hint + synthesize button */}
      <div className="flex items-center justify-end gap-3 border-b border-border bg-surface px-4 py-2">
        {onCooldown && (
          <span className="text-xs text-foreground-muted">{t("documents.cooldownHint", { minutes: minutesLeft, formattedMinutes: formatNumber(minutesLeft) })}</span>
        )}
        <Button
          size="sm"
          onClick={() => synth.mutate()}
          disabled={isGenerating || onCooldown || docsQuery.isPending}
        >
          {buttonLabel}
        </Button>
      </div>

      {/* Blended output: resume on top, structured document below */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {docsQuery.isPending ? (
          <p className="text-sm text-foreground-muted">{t("documents.loading")}</p>
        ) : isGenerating && !doc ? (
          <p className="text-sm text-foreground-muted">{t("documents.synthesizing")}</p>
        ) : doc ? (
          <article className="mx-auto max-w-3xl rounded-lg border border-border bg-surface p-5 shadow-sm md:p-8">
            {summaryResume && summaryResume.content && (
              <>
                <p className="mb-5 text-sm italic leading-snug text-foreground-muted">
                  {summaryResume.content}
                </p>
                <hr className="mb-5 border-border" />
              </>
            )}
            <Markdown content={doc.content} />
            <footer className="mt-8 border-t border-border pt-3 text-[11px] text-foreground-muted">
              {t("documents.footer", { time: formatTime(doc.updatedAt), model: doc.model })}
            </footer>
          </article>
        ) : (
          <EmptyState
            title={t("documents.emptyTitle")}
            hint={t("documents.emptyHint")}
          />
        )}
      </div>
    </div>
  );
}