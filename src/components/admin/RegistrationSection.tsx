import { useState } from "react";
import { apiAdminRegistration } from "../../lib/api";
import { AdminCard, SectionError, type AdminErrorHandler } from "./adminShared";

export function RegistrationSection({
  open,
  onChange,
  onError,
}: {
  open: boolean;
  onChange: (open: boolean) => void;
  onError: AdminErrorHandler;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    const next = !open;
    setBusy(true);
    setError("");
    try {
      await apiAdminRegistration(next);
      onChange(next);
    } catch (err) {
      setError(onError(err, "Couldn't change registration"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-bold">Registration</p>
          <p className="text-sm text-[var(--text-muted)]">
            {open ? "New players can sign up" : "Signups are locked"}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className="min-h-11 rounded-2xl border-2 border-[var(--accent-green)] px-4 font-bold text-[var(--accent-green)] disabled:opacity-60"
        >
          {busy ? "Saving..." : open ? "Lock registration" : "Open registration"}
        </button>
      </div>
      <SectionError message={error} />
    </AdminCard>
  );
}
