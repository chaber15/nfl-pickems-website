import { Link, NavLink } from "react-router-dom";
import {
  Football,
  Trophy,
  ClockCounterClockwise,
  ChartBar,
  Question,
  ShieldCheck,
  SignOut,
} from "@phosphor-icons/react";
import { useAuth } from "../lib/authContext";
import { NFL_LOGO_SRC } from "../lib/teamLogos";
import { MiniWeeklyLeaderboard } from "./MiniWeeklyLeaderboard";

const links = [
  { to: "/", label: "Picks", icon: Football },
  { to: "/history", label: "History", icon: ClockCounterClockwise },
  { to: "/leaderboard", label: "Leaders", icon: Trophy },
  { to: "/stats", label: "Stats", icon: ChartBar },
  { to: "/how-to-play", label: "How", icon: Question },
];

export function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r-2 lg:border-[var(--border-card)] lg:bg-[var(--sidebar-bg)] lg:px-4 lg:py-6">
      <Link
        to="/"
        className="mb-8 flex items-center gap-3 rounded-2xl px-2 py-1 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
        aria-label="NFL Pick'ems home — Make Your Picks"
      >
        <img src={NFL_LOGO_SRC} alt="" className="h-10 w-auto object-contain" />
        <h1 className="font-display text-2xl text-[var(--text-primary)]">
          NFL Pick&apos;ems
        </h1>
      </Link>
      <nav className="flex flex-col gap-2">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-[var(--accent-green)] text-[var(--accent-on-green)]"
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
                isActive ? "bg-[var(--accent-green)] text-[var(--accent-on-green)]" : "text-[var(--text-primary)]"
              }`
            }
          >
            <ShieldCheck size={22} weight="bold" />
            Admin
          </NavLink>
        )}
      </nav>

      <MiniWeeklyLeaderboard />

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={() => logout()}
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-card-elevated)]"
        >
          <SignOut size={22} weight="bold" />
          Switch user
        </button>
      </div>
    </aside>
  );
}

export function BottomNav() {
  const { user } = useAuth();
  const allLinks = user?.isAdmin ? [...links, { to: "/admin", label: "Admin", icon: ShieldCheck }] : links;

  const cols =
    allLinks.length >= 7
      ? "grid-cols-7"
      : allLinks.length >= 6
        ? "grid-cols-6"
        : allLinks.length >= 5
          ? "grid-cols-5"
          : "grid-cols-4";

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
