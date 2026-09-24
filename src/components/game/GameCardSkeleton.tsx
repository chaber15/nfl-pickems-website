export function GameCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-4" aria-hidden>
      <div className="mb-3 h-4 w-32 rounded bg-[var(--border-card)]" />
      <div className="mb-4 flex items-center justify-center gap-4">
        <div className="flex flex-1 flex-col items-center gap-2">
          <div className="size-14 rounded bg-[var(--border-card)]" />
          <div className="h-4 w-20 rounded bg-[var(--border-card)]" />
        </div>
        <div className="h-6 w-6 rounded bg-[var(--border-card)]" />
        <div className="flex flex-1 flex-col items-center gap-2">
          <div className="size-14 rounded bg-[var(--border-card)]" />
          <div className="h-4 w-20 rounded bg-[var(--border-card)]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 rounded-2xl bg-[var(--border-card)]" />
        <div className="h-28 rounded-2xl bg-[var(--border-card)]" />
      </div>
    </div>
  );
}
