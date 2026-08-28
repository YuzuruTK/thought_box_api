import type { ComponentProps } from "react";

/**
 * Surface card: border + surface + shadow, rounded-xl by default.
 * Padding and internal layout are the caller's responsibility.
 */
export function Card({
  interactive = false,
  className = "",
  ...props
}: ComponentProps<"div"> & { interactive?: boolean }) {
  const base =
    "rounded-xl border border-border bg-surface shadow-sm" +
    (interactive ? " transition-shadow hover:shadow-md" : "");
  return <div className={`${base} ${className}`} {...props} />;
}
