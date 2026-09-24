import { useState } from "react";

/** Honest "couldn't load" state with a Retry button (distinct from an empty state). */
export function ErrorState({
  message,
  onRetry,
  compact = false,
  title = "Couldn't load this",
}: {
  message: string;
  onRetry?: () => void | Promise<void>;
  compact?: boolean;
  title?: string;
}) {
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className={`rounded-2xl border-2 border-[var(--accent-red)] bg-[var(--accent-red)]/10 text-[var(--text-primary)] ${
        compact ? "px-3 py-2 text-xs" : "px-4 py-4 text-sm"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {!compact && <p className="font-bold text-[var(--accent-red)]">{title}</p>}
          <p className={compact ? "font-semibold text-[var(--accent-red)]" : "mt-0.5 text-[var(--text-muted)]"}>
            {message}
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            className={`shrink-0 rounded-xl border-2 border-[var(--accent-red)] bg-[var(--bg-card)] font-bold text-[var(--accent-red)] disabled:opacity-60 ${
              compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm"
            }`}
          >
            {retrying ? "Retrying..." : "Retry"}
          </button>
        )}
      </div>
    </div>
  );
}
