import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useCreateThought, useDeleteThought, useThoughts } from "../../hooks/useThoughts";
import { ApiError } from "../../services/api";
import type { Thought } from "../../services/api";
import { EmptyState, ErrorBanner } from "../../components/Feedback";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ThoughtsPanelProps {
  boxId: number;
}

/**
 * Thought list + fast-capture input.
 *
 * The primary workflow: type a thought, press Enter, it appears in the list,
 * the input clears and keeps focus — ready for the next idea.
 */
export function ThoughtsPanel({ boxId }: ThoughtsPanelProps) {
  const thoughtsQuery = useThoughts(boxId);
  const createThought = useCreateThought(boxId);
  const deleteThought = useDeleteThought(boxId);

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the capture input focused so rapid entry never needs a click.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (content === "" || createThought.isPending) return;

    setError(null);
    setDraft("");
    try {
      await createThought.mutateAsync(content);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that thought. Try again.");
    } finally {
      // Re-focus even if a re-render stole focus during optimistic update.
      inputRef.current?.focus();
    }
  }

  const thoughts = thoughtsQuery.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <div className="px-4 pt-3 md:px-6">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {thoughtsQuery.isPending ? (
          <p className="text-sm text-neutral-400">Loading thoughts…</p>
        ) : thoughts.length === 0 ? (
          <EmptyState
            title="No thoughts yet."
            hint='Type your first idea below and press Enter. e.g. "Player is a courier."'
          />
        ) : (
          <ul className="space-y-2">
            {thoughts.map((thought) => (
              <ThoughtCard
                key={thought.id}
                thought={thought}
                onDelete={() => deleteThought.mutate(thought.id)}
                deleting={deleteThought.isPending && deleteThought.variables === thought.id}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Fast thought entry */}
      <form onSubmit={handleSubmit} className="border-t border-neutral-200 bg-white px-4 py-3">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a thought, press Enter…"
          maxLength={10_000}
          autoComplete="off"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-500 focus:ring-1 focus:ring-neutral-400"
          aria-label="New thought"
        />
      </form>
    </div>
  );
}

function ThoughtCard({
  thought,
  onDelete,
  deleting,
}: {
  thought: Thought;
  onDelete(): void;
  deleting: boolean;
}) {
  return (
    <li className="group relative rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-sm">
      <p className="whitespace-pre-wrap pr-6 text-sm leading-relaxed text-neutral-800">
        {thought.content}
      </p>
      <div className="mt-1.5 text-[11px] text-neutral-400">{formatTimestamp(thought.createdAt)}</div>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="absolute top-2 right-2 hidden rounded p-1 text-xs text-neutral-300 hover:bg-red-50 hover:text-red-500 group-hover:block disabled:cursor-wait"
        title="Delete thought"
        aria-label="Delete thought"
      >
        ✕
      </button>
    </li>
  );
}
