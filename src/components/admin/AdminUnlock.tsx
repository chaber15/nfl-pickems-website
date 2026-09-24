import { useState, type FormEvent } from "react";
import { ApiError, apiAdminUnlock, errorMessage, type AdminTier } from "../../lib/api";

function unlockErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "BAD_PIN") return "That passphrase didn't work. Check it and try again.";
    if (err.code === "PIN_NOT_CONFIGURED") {
      return "The admin passphrase isn't set up on the server yet (ADMIN_PIN in Netlify settings).";
    }
    if (err.code === "FORBIDDEN") return "This account isn't an admin.";
  }
  return errorMessage(err, "Couldn't unlock. Please try again.");
}

/** Passphrase form. The regular passphrase unlocks "admin"; the super passphrase unlocks "super". */
export function AdminUnlock({
  onUnlocked,
  title = "Admin tools are locked",
  description = "Enter the admin passphrase to manage players and the season.",
  submitLabel = "Unlock",
  compact = false,
  onCancel,
}: {
  onUnlocked: (tier: AdminTier) => void;
  title?: string;
  description?: string;
  submitLabel?: string;
  compact?: boolean;
  onCancel?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiAdminUnlock(pin);
      setPin("");
      onUnlocked(res.tier);
    } catch (err) {
      setError(unlockErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className={
        compact
          ? "space-y-3"
          : "space-y-4 rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-6"
      }
    >
      <div>
        <p className="font-bold">{title}</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
      </div>
      <label className="block">
        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Passphrase</span>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-12 w-full max-w-sm rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-page)] px-3 text-base"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--accent-red)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !pin.trim()}
          className="min-h-11 rounded-2xl bg-[var(--accent-green)] px-4 font-bold text-[var(--accent-on-green)] disabled:opacity-60"
        >
          {busy ? "Checking..." : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-2xl border-2 border-[var(--border-card)] px-4 font-bold"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
