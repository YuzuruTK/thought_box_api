import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../auth/AuthContext";
import { useBoxes, useCreateBox, useDeleteBox } from "../../hooks/useBoxes";
import { ApiError } from "../../services/api";
import type { Box } from "../../services/api";
import { ErrorBanner } from "../../components/Feedback";
import { formatShortDate } from "../../lib/dates";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";

const boxNameSchema = z.string().trim().min(1).max(100);

// ---------------------------------------------------------------------------
// Sorting (persisted in localStorage)
// ---------------------------------------------------------------------------

type SortField = "created" | "edited";
type SortDir = "asc" | "desc";

interface SortState {
  field: SortField;
  dir: SortDir;
}

const SORT_KEY = "thoughtbox_sort";
const DEFAULT_SORT: SortState = { field: "created", dir: "desc" };

function loadSort(): SortState {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SortState>;
      if (
        (parsed.field === "created" || parsed.field === "edited") &&
        (parsed.dir === "asc" || parsed.dir === "desc")
      ) {
        return parsed as SortState;
      }
    }
  } catch {
    // Corrupted value — fall back to defaults.
  }
  return DEFAULT_SORT;
}

/** Timestamp a box is sorted by; empty boxes fall back to creation date. */
function sortTimestamp(box: Box, field: SortField): number {
  const iso = field === "created" ? box.createdAt : (box.lastActivityAt ?? box.createdAt);
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Home screen: all boxes as cards in a grid.
 * The first cell is always the "+ New Box" card; clicking any other card
 * opens the box. Grid flows top-to-bottom, left-to-right.
 */
export function BoxesGrid() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const boxesQuery = useBoxes();
  const createBox = useCreateBox();
  const deleteBox = useDeleteBox();

  const [sort, setSort] = useState<SortState>(loadSort);
  useEffect(() => {
    localStorage.setItem(SORT_KEY, JSON.stringify(sort));
  }, [sort]);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const sorted = useMemo(() => {
    const copy = [...(boxesQuery.data ?? [])];
    copy.sort((a, b) => sortTimestamp(a, sort.field) - sortTimestamp(b, sort.field));
    if (sort.dir === "desc") copy.reverse();
    return copy;
  }, [boxesQuery.data, sort]);

  async function submitNewBox(event: FormEvent) {
    event.preventDefault();
    const parsed = boxNameSchema.safeParse(newName);
    if (!parsed.success) return; // empty name: stay in the input
    setError(null);
    try {
      const created = await createBox.mutateAsync(parsed.data);
      setNewName("");
      setCreating(false);
      navigate(`/app/box/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the box. Try again.");
    }
  }

  function handleDelete(box: Box) {
    const ok = window.confirm(`Delete "${box.name}"? Its generated documents will be removed.`);
    if (!ok) return;
    setError(null);
    deleteBox.mutate(box.id, {
      onError: () => setError("Could not delete the box. Try again."),
    });
  }

  return (
    <div className="min-h-dvh bg-surface-muted text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-lg font-semibold tracking-tight">Thought Box</h1>

          {/* Sort field */}
          <nav className="flex overflow-hidden rounded-md border border-border bg-surface">
            {(
              [
                { id: "created", label: "Created" },
                { id: "edited", label: "Last edited" },
              ] as const
            ).map(({ id, label }) => (
              <Button
                key={id}
                size="sm"
                variant={sort.field === id ? "primary" : "ghost"}
                onClick={() => setSort((s) => ({ ...s, field: id }))}
                className={
                  sort.field === id ? "rounded-none" : "rounded-none hover:bg-surface-muted"
                }
              >
                {label}
              </Button>
            ))}
          </nav>

          {/* Sort direction */}
          <button
            type="button"
            onClick={() => setSort((s) => ({ ...s, dir: s.dir === "desc" ? "asc" : "desc" }))}
            title={sort.dir === "desc" ? "Descending" : "Ascending"}
            aria-label={sort.dir === "desc" ? "Sort descending" : "Sort ascending"}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground-muted hover:bg-surface-muted"
          >
            {sort.dir === "desc" ? "↓" : "↑"}
          </button>

          <Button variant="ghost" size="sm" onClick={logout}>
            Log out
          </Button>
        </header>

        {(error || boxesQuery.error) && (
          <div className="mb-4">
            <ErrorBanner
              message={
                error ??
                (boxesQuery.error instanceof ApiError
                  ? boxesQuery.error.message
                  : "Could not load your boxes.")
              }
            />
          </div>
        )}

        {boxesQuery.isPending ? (
          <p className="text-sm text-foreground-muted">Loading boxes…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* "+ New Box" — always the first cell */}
            {creating ? (
              <form
                onSubmit={submitNewBox}
                className="flex min-h-[150px] flex-col justify-center rounded-xl border border-dashed border-border bg-surface p-4 shadow-sm"
              >
                <Input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setCreating(false);
                      setNewName("");
                    }
                  }}
                  placeholder="Box name"
                  maxLength={100}
                  autoComplete="off"
                  aria-label="New box name"
                />
                <p className="mt-2 text-[11px] text-foreground-muted">Enter to create · Esc to cancel</p>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-[150px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-transparent p-4 text-foreground-muted transition-colors hover:border-foreground-muted hover:text-foreground"
              >
                <span className="text-2xl leading-none">+</span>
                <span className="text-sm font-medium">New Box</span>
              </button>
            )}

            {sorted.map((box) => (
              <BoxCard
                key={box.id}
                box={box}
                onSelect={() => navigate(`/app/box/${box.id}`)}
                onDelete={() => handleDelete(box)}
                deleting={deleteBox.isPending && deleteBox.variables === box.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BoxCard({
  box,
  onSelect,
  onDelete,
  deleting,
}: {
  box: Box;
  onSelect(): void;
  onDelete(): void;
  deleting: boolean;
}) {
  return (
    <Card interactive className="group relative flex min-h-[150px] flex-col p-4">
      <button type="button" onClick={onSelect} className="flex min-h-0 flex-1 flex-col text-left">
        <h3 className="truncate pr-6 text-sm font-medium text-foreground">{box.name}</h3>
        <p className="mt-0.5 text-[11px] text-foreground-muted">
          {box.thoughtCount} {box.thoughtCount === 1 ? "thought" : "thoughts"}
        </p>

        {/* Summary preview — short plain-text resume of the cached AI summary */}
        {box.summaryPreview ? (
          <p className="mt-2 line-clamp-2 text-sm leading-snug text-foreground-muted">
            {box.summaryPreview}
          </p>
        ) : (
          <p className="mt-2 text-sm italic leading-snug text-foreground-faint">No summary yet.</p>
        )}

        <div className="mt-auto pt-3 text-[11px] text-foreground-muted">
          Created {formatShortDate(box.createdAt)}
          {box.lastActivityAt && <> · Edited {formatShortDate(box.lastActivityAt)}</>}
        </div>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={deleting}
        className="absolute top-2 right-2 hidden rounded p-1 text-xs text-foreground-faint hover:bg-danger-surface hover:text-danger-muted group-hover:block disabled:cursor-wait"
        title={`Delete ${box.name}`}
        aria-label={`Delete ${box.name}`}
      >
        ✕
      </button>
    </Card>
  );
}
