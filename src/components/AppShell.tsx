import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SignOut } from "@phosphor-icons/react";
import { TickerBar } from "./TickerBar";
import { Sidebar, BottomNav } from "./Nav";
import { ThemeToggle } from "./ThemeToggle";
import { WeekSelector } from "./WeekSelector";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import { NFL_LOGO_SRC } from "../lib/teamLogos";
import type { GameData } from "@shared/types";

interface AppShellProps {
  children: ReactNode;
  games?: GameData[];
  banner?: string;
  showWeekSelector?: boolean;
}

export function AppShell({ children, games = [], banner, showWeekSelector = true }: AppShellProps) {
  const { username, user, logout } = useAuth();
  const { isDemo } = useWeek();
  const displayBanner = banner ?? (isDemo ? "DEMO MODE" : undefined);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-page text-[var(--text-primary)]">
      <TickerBar games={games} />
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--border-card)] px-4 py-3 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Link
                to="/"
                className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] lg:hidden"
                aria-label="NFL Pick'ems home — Make Your Picks"
              >
                <img
                  src={NFL_LOGO_SRC}
                  alt=""
                  className="h-9 w-auto object-contain"
                />
              </Link>
              <div className="min-w-0">
                {displayBanner && (
                  <p className="font-display mb-0.5 text-lg text-[var(--accent-gold)] sm:text-xl">
                    {displayBanner}
                  </p>
                )}
                {username && (
                  <p className="truncate text-sm font-semibold">
                    Playing as{" "}
                    <span className="font-mono text-[var(--accent-green)]">
                      {user?.displayName || username}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {showWeekSelector && <WeekSelector />}
              <button
                type="button"
                onClick={() => logout()}
                aria-label="Switch user"
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] px-3 text-sm font-semibold text-[var(--text-primary)] lg:hidden"
              >
                <SignOut size={22} weight="bold" />
                <span className="sm:inline">Switch</span>
              </button>
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-8">{children}</main>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
