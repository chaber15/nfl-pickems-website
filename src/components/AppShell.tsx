import { Link, Outlet, useLocation } from "react-router-dom";
import { SignOut } from "./icons";
import { TickerBar } from "./TickerBar";
import { Sidebar, BottomNav } from "./Nav";
import { ThemeToggle } from "./ThemeToggle";
import { WeekSelector } from "./WeekSelector";
import { ErrorState } from "./ErrorState";
import { useAuth } from "../lib/authContext";
import { NFL_LOGO_SRC } from "../lib/teamLogos";
import { ChangeUsernamePanel } from "./ChangeUsernamePanel";
import { confirmSwitchUser } from "../lib/confirm";

/** Routes where the week picker doesn't apply. */
const NO_WEEK_SELECTOR = new Set(["/how-to-play"]);

/** Layout route: stays mounted across page navigations (sidebar, ticker, mini leaderboard). */
export function AppShell() {
  const { username, user, logout, sessionError, retrySession } = useAuth();
  const { pathname } = useLocation();
  const showWeekSelector = !NO_WEEK_SELECTOR.has(pathname);

  const onSwitch = () => {
    if (confirmSwitchUser()) void logout();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-page text-[var(--text-primary)]">
      <TickerBar />
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
                <img src={NFL_LOGO_SRC} alt="" className="h-9 w-auto object-contain" />
              </Link>
              {username && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    Playing as{" "}
                    <span className="font-mono text-[var(--accent-green)]">{user?.displayName || username}</span>
                  </p>
                  <div className="lg:hidden">
                    <ChangeUsernamePanel compact />
                  </div>
                </div>
              )}
            </div>
            {showWeekSelector && (
              <div className="order-last flex w-full justify-center sm:order-none sm:w-auto">
                <WeekSelector />
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <button
                type="button"
                onClick={onSwitch}
                aria-label="Switch player"
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] px-3 text-sm font-semibold text-[var(--text-primary)] lg:hidden"
              >
                <SignOut size={22} weight="bold" />
                <span>Switch</span>
              </button>
            </div>
          </header>
          <main className="flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-8">
            {sessionError && (
              <div className="mx-auto mb-4 max-w-6xl">
                <ErrorState
                  compact
                  message={`${sessionError} You're still signed in — your data will load once the server is back.`}
                  onRetry={retrySession}
                />
              </div>
            )}
            <Outlet />
          </main>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
