import { NavLink } from "react-router-dom";
import {
  Football,
  Trophy,
  ClockCounterClockwise,
  ChartBar,
  ShieldCheck,
  SignOut,
} from "@phosphor-icons/react";
import { useAuth } from "../lib/authContext";
import { NFL_LOGO_SRC } from "../lib/teamLogos";

const links = [
  { to: "/", label: "Picks", icon: Football },
  { to: "/history", label: "History", icon: ClockCounterClockwise },
  { to: "/leaderboard", label: "Leaders", icon: Trophy },
  { to: "/stats", label: "Stats", icon: ChartBar },
];

export function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r-2 lg:border-[var(--border-card)] lg:bg-[var(--sidebar-bg)] lg:px-4 lg:py-6">
      <div className="mb-8 flex items-center gap-3 px-2">
        <img src={NFL_LOGO_SRC} alt="NFL" className="h-10 w-auto object-contain" />
        <h1 className="font-pixel text-xs leading-relaxed text-[var(--text-primary)]">
          NFL PICK&apos;EMS
        </h1>
      </div>
      <nav className="flex flex-1 flex-col gap-2">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-[var(--accent-green)] text-white"
                  : "text-[var(--text-primary)] hover:bg-[var(--bg-card-elevated)]"
              }`
            }
          >
            <Icon size={22} weight="bold" />
            {label}
          </NavLink>
        ))}
        {user?.isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold ${
                isActive ? "bg-[var(--accent-green)] text-white" : "text-[var(--text-primary)]"
              }`
            }
          >
            <ShieldCheck size={22} weight="bold" />
            Admin
          </NavLink>
        )}
      </nav>
      <button
        type="button"
        onClick={() => logout()}
        className="mt-4 flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-card-elevated)]"
      >
        <SignOut size={22} weight="bold" />
        Switch user
      </button>
    </aside>
  );
}

export function BottomNav() {
  const { user } = useAuth();
  const allLinks = user?.isAdmin ? [...links, { to: "/admin", label: "Admin", icon: ShieldCheck }] : links;

  const cols = allLinks.length >= 5 ? "grid-cols-5" : "grid-cols-4";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-[var(--border-card)] bg-[var(--bg-card)] pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className={`grid ${cols} gap-1 px-2 py-2`}>
        {allLinks.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold ${
                isActive ? "text-[var(--accent-green)]" : "text-[var(--text-muted)]"
              }`
            }
          >
            <Icon size={22} weight="bold" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
