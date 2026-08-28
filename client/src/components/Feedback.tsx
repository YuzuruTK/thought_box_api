import type { ReactNode } from "react";
import { Alert } from "./ui/Alert";

/** Inline banner for user-facing error messages. */
export function ErrorBanner({ message }: { message: string }) {
  return <Alert>{message}</Alert>;
}

/** Muted empty-state block. */
export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground-muted">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-foreground-muted">{hint}</p> : null}
    </div>
  );
}
