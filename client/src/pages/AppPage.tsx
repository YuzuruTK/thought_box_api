import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ThoughtsPanel } from "../features/thoughts/ThoughtsPanel";
import { DocumentPanel } from "../features/documents/DocumentPanel";
import { useBoxes } from "../hooks/useBoxes";
import { useAppTranslation } from "../hooks/useAppTranslation";

/**
 * Box view with two panes side by side (stacked on mobile):
 * left — thoughts & fast capture; right — the synthesized output
 * (brief resume + structured document).
 */
export default function AppPage() {
  const params = useParams<{ boxId: string }>();
  const navigate = useNavigate();
  const { t } = useAppTranslation();

  const parsedId = Number(params.boxId);
  const selectedBoxId =
    params.boxId !== undefined && Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;

  const boxesQuery = useBoxes();
  const boxes = boxesQuery.data ?? [];
  const selectedBox = boxes.find((box) => box.id === selectedBoxId);

  // If the selected box disappears (e.g. deleted in this session), go back to
  // the grid.
  useEffect(() => {
    if (!boxesQuery.isPending && selectedBoxId !== null && !selectedBox) {
      navigate("/app", { replace: true });
    }
  }, [boxesQuery.isPending, selectedBoxId, selectedBox, navigate]);

  return (
    <div className="flex h-dvh flex-col bg-surface-muted text-foreground">
      <header className="border-b border-border bg-surface px-4 py-2.5 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/app"
              className="shrink-0 rounded px-1.5 py-1 text-xs text-foreground-muted hover:bg-surface-subtle hover:text-foreground"
            >
              {t("common.allBoxes")}
            </Link>
            <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
              {selectedBox?.name ?? ""}
            </h1>
          </div>
          <span className="shrink-0 text-[11px] text-foreground-muted">{t("app.autoHourly")}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Thoughts pane */}
        <section className="flex h-[45vh] min-h-0 flex-col border-b border-border bg-surface md:h-auto md:w-1/2 md:border-b-0 md:border-r">
          <div className="px-4 pt-3 pb-0 text-[11px] font-medium uppercase tracking-wider text-foreground-muted md:px-6">
            {t("app.thoughts")}
          </div>
          {selectedBox ? (
            <ThoughtsPanel key={`thoughts-${selectedBox.id}`} boxId={selectedBox.id} />
          ) : (
            <p className="p-4 text-sm text-foreground-muted">{t("app.selectBox")}</p>
          )}
        </section>

        {/* Document pane */}
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-3 pb-0 text-[11px] font-medium uppercase tracking-wider text-foreground-muted md:px-6">
            {t("app.document")}
          </div>
          {selectedBox ? (
            <DocumentPanel key={`document-${selectedBox.id}`} boxId={selectedBox.id} />
          ) : (
            <p className="p-4 text-sm text-foreground-muted">{t("app.selectBox")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
