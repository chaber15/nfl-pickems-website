import { useState } from "react";
import { useAuth } from "../lib/authContext";
import { NFL_LOGO_SRC } from "../lib/teamLogos";

export function UsernameGate({ children }: { children: React.ReactNode }) {
  const { username, loading, login } = useAuth();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-page">
        <p className="font-pixel text-xs text-[var(--text-muted)]">Loading...</p>
      </div>
    );
  }

  if (username) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const val = input.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(val)) {
      setError("Use 3-20 characters: letters, numbers, underscore");
      return;
    }
    setSubmitting(true);
    try {
      await login(val);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-page px-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex flex-col items-center gap-3">
          <img src={NFL_LOGO_SRC} alt="NFL" className="h-14 w-auto object-contain" />
          <h1 className="font-pixel text-center text-sm leading-relaxed">NFL PICK&apos;EMS</h1>
        </div>
        <p className="mb-6 text-center text-sm text-[var(--text-muted)]">
          Enter a username to start picking. No password needed for family play.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Username</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-12 w-full rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-page)] px-4 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]"
              placeholder="your_name"
              autoComplete="username"
              maxLength={20}
            />
          </label>
          {error && <p className="text-sm font-medium text-[var(--accent-red)]">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="min-h-12 w-full rounded-2xl bg-[var(--accent-green)] text-base font-bold text-white disabled:opacity-60"
          >
            {submitting ? "Starting..." : "Start Picking"}
          </button>
        </form>
      </div>
    </div>
  );
}
