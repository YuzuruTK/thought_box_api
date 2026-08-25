import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ThoughtsPanel } from "../features/thoughts/ThoughtsPanel";
import { DocumentPanel } from "../features/documents/DocumentPanel";
import { useBoxes } from "../hooks/useBoxes";
import { useDocuments } from "../hooks/useDocuments";
import { formatTime } from "../lib/dates";

/**
 * Box view with two panes side by side (stacked on mobile):
 * left — thoughts & fast capture; right — the synthesized document.
 * The distilled summary resume sits in the header, spanning both.
 */
export default function AppPage() {
  const params = useParams<{ boxId: string }>();
  const navigate = useNavigate();

  const parsedId = Number(params.boxId);
  const selectedBoxId =
    params.boxId !== undefined && Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;

  const boxesQuery = useBoxes();
  const boxes = boxesQuery.data ?? [];
  const selectedBox = boxes.find((box) => box.id === selectedBoxId);

  const docsQuery = useDocuments(selectedBoxId);
  const summaryDoc = docsQuery.data?.find((doc) => doc.type === "summary");

  // If the selected box disappears (e.g. deleted in this session), go back to
  // the grid.
  useEffect(() => {
    if (!boxesQuery.isPending && selectedBoxId !== null && !selectedBox) {
      navigate("/app", { replace: true });
    }
  }, [boxesQuery.isPending, selectedBoxId, selectedBox, navigate]);

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white px-4 py-2.5 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/app"
              className="shrink-0 rounded px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            >
              ← All boxes
            </Link>
            <h1 className="truncate text-sm font-semibold tracking-tight text-neutral-900">
              {selectedBox?.name ?? ""}
            </h1>
          </div>
          <span className="shrink-0 text-[11px] text-neutral-400">auto hourly</span>
        </div>

        {/* Distilled summary resume */}
        <p className="mt-1 line-clamp-2 text-sm italic leading-snug text-neutral-600">
          {summaryDoc
            ? summaryDoc.content
            : "No distilled summary yet — it refreshes automatically every hour."}
        </p>
        {summaryDoc && (
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Distilled {formatTime(summaryDoc.updatedAt)}
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Thoughts pane */}
        <section className="flex h-[45vh] min-h-0 flex-col border-b border-neutral-200 bg-white md:h-auto md:w-1/2 md:border-b-0 md:border-r">
          <div className="px-4 pt-3 pb-0 text-[11px] font-medium uppercase tracking-wider text-neutral-400 md:px-6">
            Thoughts
          </div>
          {selectedBox ? (
            <ThoughtsPanel key={`thoughts-${selectedBox.id}`} boxId={selectedBox.id} />
          ) : (
            <p className="p-4 text-sm text-neutral-400">Select a box.</p>
          )}
        </section>

        {/* Document pane */}
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-3 pb-0 text-[11px] font-medium uppercase tracking-wider text-neutral-400 md:px-6">
            Document
          </div>
          {selectedBox ? (
            <DocumentPanel key={`document-${selectedBox.id}`} boxId={selectedBox.id} />
          ) : (
            <p className="p-4 text-sm text-neutral-400">Select a box.</p>
          )}
        </section>
      </div>
    </div>
  );
}
