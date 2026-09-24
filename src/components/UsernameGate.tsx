import { useState, type FormEvent, type ReactNode } from "react";
import { USERNAME_PATTERN } from "@shared/userDisplay";
import { ApiError, errorMessage } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { NFL_LOGO_SRC } from "../lib/teamLogos";
import { ErrorState } from "./ErrorState";

function friendlyLoginError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "REGISTRATION_CLOSED") {
      return "New players can't join right now. Ask the family admin to open sign-ups, or check the spelling of your name.";
    }
    if (err.code === "BANNED") return "This player has been blocked. Ask the family admin for help.";
  }
  return errorMessage(err, "Couldn't sign in. Please try again.");
}

export function UsernameGate({ children }: { children: ReactNode }) {
  const { username, loading, login, sessionError, retrySession } = useAuth();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  /** Name that doesn't exist yet — ask before creating (typo protection). */
  const [confirmName, setConfirmName] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-page">
        <p className="font-display text-2xl text-[var(--text-muted)]">Loading...</p>
      </div>
    );
  }

  if (username) return <>{children}</>;

  const attempt = async (name: string, create: boolean) => {
    setError("");
    setSubmitting(true);
    try {
      await login(name, { create });
      setConfirmName(null);
    } catch (err) {
      if (!create && err instanceof ApiError && err.code === "USER_NOT_FOUND") {
        setConfirmName(name);
      } else {
        setError(friendlyLoginError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const val = input.trim();
    if (!USERNAME_PATTERN.test(val)) {
      setError("Use 3-20 characters: letters, numbers, underscore");
      return;
    }
    void attempt(val, false);
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-page px-4">
      <div className="w-full max-w-md space-y-4">
        {sessionError && (
          <ErrorState compact message={sessionError} onRetry={retrySession} />
        )}
        <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex flex-col items-center gap-3">
            <img src={NFL_LOGO_SRC} alt="NFL" className="h-14 w-auto object-contain" />
            <h1 className="font-display text-center text-4xl">NFL Pick&apos;ems</h1>
          </div>

          {confirmName ? (
            <div className="space-y-4">
              <p className="text-center text-base font-semibold">
                No player named “{confirmName}” yet. Create a new player?
              </p>
              <p className="text-center text-sm text-[var(--text-muted)]">
                If you've played before, go back and check the spelling of your name.
              </p>
              {error && <p className="text-sm font-medium text-[var(--accent-red)]">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setConfirmName(null);
                    setError("");
                  }}
                  className="min-h-12 rounded-2xl border-2 border-[var(--border-card)] text-base font-bold disabled:opacity-60"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void attempt(confirmName, true)}
                  className="min-h-12 rounded-2xl bg-[var(--accent-green)] text-base font-bold text-[var(--accent-on-green)] disabled:opacity-60"
                >
                  {submitting ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-6 text-center text-sm text-[var(--text-muted)]">
                Enter your username to start picking. No password needed for family play.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Username</span>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="min-h-12 w-full rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-page)] px-4 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]"
                    placeholder="your_name"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={20}
                  />
                </label>
                {error && <p className="text-sm font-medium text-[var(--accent-red)]">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-12 w-full rounded-2xl bg-[var(--accent-green)] text-base font-bold text-[var(--accent-on-green)] disabled:opacity-60"
                >
                  {submitting ? "Starting..." : "Start Picking"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
