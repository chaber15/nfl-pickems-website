import type { ReactNode } from "react";
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
  const { username, logout } = useAuth();
  const { isDemo, label } = useWeek();
  const displayBanner = banner ?? (isDemo ? "PRESEASON WEEK 2 - DEMO" : undefined);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-page text-[var(--text-primary)]">
      <TickerBar games={games} />
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--border-card)] px-4 py-3 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <img
                src={NFL_LOGO_SRC}
                alt="NFL"
                className="h-9 w-auto shrink-0 object-contain lg:hidden"
              />
              <div className="min-w-0">
                {displayBanner && (
                  <p className="font-pixel mb-1 text-[10px] leading-relaxed text-[var(--accent-gold)]">
                    {displayBanner}
                  </p>
                )}
                {!displayBanner && (
                  <p className="font-pixel mb-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                    {label}
                  </p>
                )}
                {username && (
                  <p className="text-sm font-semibold">
                    Playing as <span className="font-mono text-[var(--accent-green)]">{username}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {showWeekSelector && <WeekSelector />}
              <button
                type="button"
                onClick={() => logout()}
                aria-label="Switch user"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)] lg:hidden"
              >
                <SignOut size={22} weight="bold" />
              </button>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-8">{children}</main>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
