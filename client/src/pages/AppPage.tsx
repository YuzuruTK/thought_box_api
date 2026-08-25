import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ThoughtsPanel } from "../features/thoughts/ThoughtsPanel";
import { GeneratedDocsPanel } from "../features/documents/GeneratedDocsPanel";
import { useBoxes } from "../hooks/useBoxes";
import type { DocType } from "../hooks/useDocuments";

type Tab = "thoughts" | DocType;

const TABS: { id: Tab; label: string }[] = [
  { id: "thoughts", label: "Thoughts" },
  { id: "summary", label: "Summary" },
  { id: "document", label: "Document" },
];

/**
 * Box screen: selected box content (thoughts / summary / document).
 * Reached from the boxes grid; "← All boxes" navigates back.
 */
export default function AppPage() {
  const params = useParams<{ boxId: string }>();
  const navigate = useNavigate();

  const parsedId = Number(params.boxId);
  const selectedBoxId =
    params.boxId !== undefined && Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;

  const [tab, setTab] = useState<Tab>("thoughts");

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
    <div className="flex h-dvh bg-neutral-50 text-neutral-900">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header: back link + selected box name + content tabs */}
        <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-2.5 md:px-6">
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

          <nav className="flex shrink-0 overflow-hidden rounded-md border border-neutral-200">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                disabled={id !== "thoughts" && selectedBoxId === null}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === id
                    ? "bg-neutral-900 text-white"
                    : "bg-white text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        {selectedBox ? (
          tab === "thoughts" ? (
            <ThoughtsPanel key={`thoughts-${selectedBox.id}`} boxId={selectedBox.id} />
          ) : (
            <GeneratedDocsPanel
              key={`docs-${selectedBox.id}`}
              boxId={selectedBox.id}
              active={tab}
              onChangeTab={(type) => setTab(type)}
            />
          )
        ) : (
          <p className="p-4 text-sm text-neutral-400">No box selected.</p>
        )}
      </div>
    </div>
  );
}
