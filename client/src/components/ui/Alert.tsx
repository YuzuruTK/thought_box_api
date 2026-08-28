import type { ComponentProps } from "react";

const variantClasses = {
  danger: "border-danger-border bg-danger-surface text-danger",
  success: "border-success-border bg-success-surface text-success",
} as const;

/** Inline banner for user-facing messages. Only variants with real consumers. */
export function Alert({
  variant = "danger",
  className = "",
  role = "alert",
  ...props
}: ComponentProps<"div"> & { variant?: keyof typeof variantClasses }) {
  return (
    <div
      role={role}
      className={`rounded-md border px-3 py-2 text-sm ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
