import { useState } from "react";
import { USERNAME_PATTERN } from "@shared/userDisplay";
import { useAuth } from "../lib/authContext";

/** Lets the signed-in user rename their login username (unique). */
export function ChangeUsernamePanel({ compact = false }: { compact?: boolean }) {
  const { username, changeUsername } = useAuth();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(username ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!username) return null;

  const start = () => {
    setValue(username);
    setError("");
    setOpen(true);
  };

  const save = async () => {
    setError("");
    const next = value.trim();
    if (!USERNAME_PATTERN.test(next)) {
      setError("Use 3-20 characters: letters, numbers, underscore");
      return;
    }
    if (next.toLowerCase() === username.toLowerCase() && next === username) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await changeUsername(next);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change username");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={start}
        className={
          compact
            ? "-my-2 inline-flex min-h-11 items-center text-xs font-semibold text-[var(--accent-blue)] underline-offset-2 hover:underline"
            : "flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-card-elevated)]"
        }
      >
        Change username
      </button>
    );
  }

  return (
    <div
      className={
        compact
          ? "mt-2 space-y-2 rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-3"
          : "space-y-2 rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-page)] p-3"
      }
    >
      <label className="block">
        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
          New username
        </span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={20}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-11 w-full rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] px-3 text-sm font-semibold"
          aria-label="New username"
        />
      </label>
      {error && <p className="text-xs font-medium text-[var(--accent-red)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="min-h-11 rounded-xl bg-[var(--accent-green)] px-3 text-sm font-bold text-[var(--accent-on-green)] disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-xl border-2 border-[var(--border-card)] px-3 text-sm font-bold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
