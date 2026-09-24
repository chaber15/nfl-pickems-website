import type { ResultTone } from "./gameStatus";

/** Text color for a win / loss / push result. */
export function toneText(tone: ResultTone, neutral = "text-[var(--text-muted)]"): string {
  if (tone === "win") return "text-[var(--accent-green)]";
  if (tone === "loss") return "text-[var(--accent-red)]";
  if (tone === "push") return "text-[var(--accent-gold)]";
  return neutral;
}

export function toneBorder(tone: ResultTone): string {
  if (tone === "win") return "border-[var(--accent-green)]";
  if (tone === "loss") return "border-[var(--accent-red)]";
  if (tone === "push") return "border-[var(--accent-gold)]";
  return "border-[var(--border-card)]";
}

/** Soft background + text for pills. */
export function tonePill(tone: ResultTone): string {
  if (tone === "win") return "bg-[var(--accent-green)]/15 text-[var(--accent-green)]";
  if (tone === "push") return "bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]";
  if (tone === "loss") return "bg-[var(--accent-red)]/15 text-[var(--accent-red)]";
  return "bg-[var(--bg-card-elevated)] text-[var(--text-muted)]";
}

/** Soft background + ring for team panels. */
export function tonePanel(tone: ResultTone): string {
  if (tone === "win") return "bg-[var(--accent-green)]/15 ring-2 ring-[var(--accent-green)]";
  if (tone === "push") return "bg-[var(--accent-gold)]/15 ring-2 ring-[var(--accent-gold)]";
  if (tone === "loss") return "bg-[var(--accent-red)]/15 ring-2 ring-[var(--accent-red)]";
  return "bg-[var(--bg-card-elevated)]/60";
}
