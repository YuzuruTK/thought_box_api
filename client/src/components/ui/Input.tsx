import type { ComponentProps } from "react";

const baseClasses =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-foreground-muted focus:border-primary focus:ring-1 focus:ring-primary/30";

/** Styled text input. Forwards ref (thought-capture autofocus depends on it). */
export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${baseClasses} ${className}`} {...props} />;
}
