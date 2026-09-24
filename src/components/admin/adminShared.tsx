import type { ReactNode } from "react";
import { ApiError, errorMessage } from "../../lib/api";

export function AdminCard({
  children,
  danger = false,
}: {
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border-2 bg-[var(--bg-card)] p-6 ${
        danger ? "border-[var(--accent-red)]" : "border-[var(--border-card)]"
      }`}
    >
      {children}
    </section>
  );
}

export function SectionError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-3 rounded-xl border-2 border-[var(--accent-red)] bg-[var(--accent-red)]/10 px-3 py-2 text-sm font-semibold text-[var(--accent-red)]"
    >
      {message}
    </p>
  );
}

export function SectionSuccess({ message }: { message: string }) {
  if (!message) return null;
  return <p className="mt-3 text-sm font-semibold text-[var(--accent-green)]">{message}</p>;
}

/**
 * Turn an admin API failure into a message. If the unlock expired, `onLocked`
 * sends the page back to the passphrase screen.
 */
export type AdminErrorHandler = (err: unknown, fallback: string) => string;

export function makeAdminErrorHandler(onLocked: () => void): AdminErrorHandler {
  return (err, fallback) => {
    if (err instanceof ApiError && err.code === "ADMIN_LOCKED") {
      onLocked();
      return "Admin tools locked again — enter the passphrase to continue.";
    }
    return errorMessage(err, fallback);
  };
}

export const ADMIN_BTN =
  "min-h-11 rounded-xl border-2 px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60";
