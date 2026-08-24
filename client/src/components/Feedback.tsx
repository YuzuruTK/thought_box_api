import type { ReactNode } from "react";

/** Inline banner for user-facing error messages. */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {message}
    </div>
  );
}

/** Muted empty-state block. */
export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-16 text-center">
      <p className="text-sm font-medium text-neutral-500">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-neutral-400">{hint}</p> : null}
    </div>
  );
}
