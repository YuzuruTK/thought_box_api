import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sidebar } from "../features/boxes/Sidebar";
import { ThoughtsPanel } from "../features/thoughts/ThoughtsPanel";
import { GeneratedDocsPanel } from "../features/documents/GeneratedDocsPanel";
import { useBoxes } from "../hooks/useBoxes";
import type { DocType } from "../hooks/useDocuments";
import { EmptyState } from "../components/Feedback";

type Tab = "thoughts" | DocType;

const TABS: { id: Tab; label: string }[] = [
  { id: "thoughts", label: "Thoughts" },
  { id: "summary", label: "Summary" },
  { id: "document", label: "Document" },
];

/**
 * Main application shell: box sidebar on the left, selected box content
 * (thoughts / summary / document) on the right.
 */
export default function AppPage() {
  const params = useParams<{ boxId: string }>();
  const navigate = useNavigate();

  const parsedId = Number(params.boxId);
  const selectedBoxId =
    params.boxId !== undefined && Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;

  const [tab, setTab] = useState<Tab>("thoughts");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const boxesQuery = useBoxes();
  const boxes = boxesQuery.data ?? [];
  const selectedBox = boxes.find((box) => box.id === selectedBoxId);

  // If the selected box disappears (e.g. deleted in this session), fall back
  // to the no-selection view.
  useEffect(() => {
    if (!boxesQuery.isPending && selectedBoxId !== null && !selectedBox) {
      navigate("/app", { replace: true });
    }
  }, [boxesQuery.isPending, selectedBoxId, selectedBox, navigate]);

  function selectBox(boxId: number) {
    navigate(`/app/box/${boxId}`);
    setTab("thoughts");
  }

  return (
    <div className="flex h-dvh bg-neutral-50 text-neutral-900">
      <Sidebar
        selectedBoxId={selectedBoxId}
        onSelectBox={selectBox}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-3 py-2.5 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded p-1 text-lg leading-none text-neutral-600 hover:bg-neutral-100"
            aria-label="Open boxes menu"
          >
            ☰
          </button>
          <span className="text-sm font-semibold tracking-tight">Thought Box</span>
        </div>

        {/* Header: selected box name + content tabs */}
        <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-2.5 md:px-6">
          <h1 className="truncate text-sm font-semibold tracking-tight text-neutral-900">
            {selectedBox?.name ?? "No box selected"}
          </h1>

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

        {!selectedBox ? (
          <EmptyState
            title="Select a box, or create one."
            hint='Use "+ New Box" in the sidebar to start capturing thoughts.'
          />
        ) : tab === "thoughts" ? (
          <ThoughtsPanel key={`thoughts-${selectedBox.id}`} boxId={selectedBox.id} />
        ) : (
          <GeneratedDocsPanel
            key={`docs-${selectedBox.id}`}
            boxId={selectedBox.id}
            active={tab}
            onChangeTab={(type) => setTab(type)}
          />
        )}
      </div>
    </div>
  );
}
