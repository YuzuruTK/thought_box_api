import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAuth } from "../../features/auth/AuthContext";
import { useBoxes, useCreateBox, useDeleteBox } from "../../hooks/useBoxes";
import { ApiError } from "../../services/api";
import type { Box } from "../../services/api";

const boxNameSchema = z.string().trim().min(1).max(100);

interface SidebarProps {
  selectedBoxId: number | null;
  onSelectBox(boxId: number): void;
  open: boolean;
  onClose(): void;
}

export function Sidebar({ selectedBoxId, onSelectBox, open, onClose }: SidebarProps) {
  const { logout } = useAuth();
  const boxesQuery = useBoxes();
  const createBox = useCreateBox();
  const deleteBox = useDeleteBox();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) {
      inputRef.current?.focus();
    }
  }, [creating]);

  async function submitNewBox() {
    const parsed = boxNameSchema.safeParse(newName);
    if (!parsed.success) {
      setError("Give the box a name.");
      return;
    }
    setError(null);
    try {
      const created = await createBox.mutateAsync(parsed.data);
      setNewName("");
      setCreating(false);
      onSelectBox(created.id);
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

  const boxes = boxesQuery.data ?? [];

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 transform flex-col border-r border-neutral-200 bg-white transition-transform duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Boxes"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight text-neutral-900">
            Thought Box
          </span>
          <button
            type="button"
            onClick={() => {
              logout();
              onClose();
            }}
            className="rounded px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            title="Log out"
          >
            Log out
          </button>
        </div>

        <div className="px-4 pt-4 pb-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
            Boxes
          </span>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {boxesQuery.isPending ? (
            <p className="px-2 py-3 text-xs text-neutral-400">Loading…</p>
          ) : boxes.length === 0 && !creating ? (
            <p className="px-2 py-3 text-xs text-neutral-400">No boxes yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {boxes.map((box) => {
                const selected = box.id === selectedBoxId;
                return (
                  <li key={box.id} className="group relative flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectBox(box.id);
                        onClose();
                      }}
                      className={`w-full truncate rounded-md px-2 py-1.5 pr-7 text-left text-sm ${
                        selected
                          ? "bg-neutral-900/5 font-medium text-neutral-900"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      }`}
                    >
                      {box.name}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(box);
                      }}
                      disabled={deleteBox.isPending}
                      className="absolute right-1.5 hidden rounded p-0.5 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-600 group-hover:block disabled:cursor-not-allowed"
                      title={`Delete ${box.name}`}
                      aria-label={`Delete ${box.name}`}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <div className="border-t border-neutral-100 p-3">
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          {creating ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitNewBox();
              }}
            >
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                    setError(null);
                  }
                }}
                onBlur={() => {
                  // Cancel on blur only when nothing was typed.
                  if (newName.trim() === "") {
                    setCreating(false);
                    setError(null);
                  }
                }}
                placeholder="Box name"
                maxLength={100}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-400"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
            >
              + New Box
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

