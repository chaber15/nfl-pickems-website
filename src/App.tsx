import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/authContext";
import { WeekProvider } from "./lib/weekContext";
import { GamesProvider } from "./lib/gamesContext";
import { UsernameGate } from "./components/UsernameGate";
import { AppShell } from "./components/AppShell";
import { PicksPage } from "./pages/PicksPage";
import { HistoryPage } from "./pages/HistoryPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { StatsPage } from "./pages/StatsPage";
import { HowToPlayPage } from "./pages/HowToPlayPage";
import { AdminPage } from "./pages/AdminPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WeekProvider>
          <UsernameGate>
            <GamesProvider>
              <Routes>
                {/* AppShell is a layout route so the sidebar / ticker don't remount per page. */}
                <Route element={<AppShell />}>
                  <Route path="/" element={<PicksPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/history/:username" element={<HistoryPage />} />
                  <Route path="/leaderboard" element={<LeaderboardPage />} />
                  <Route path="/stats" element={<StatsPage />} />
                  <Route path="/stats/:username" element={<StatsPage />} />
                  <Route path="/how-to-play" element={<HowToPlayPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="*" element={<PicksPage />} />
                </Route>
              </Routes>
            </GamesProvider>
          </UsernameGate>
        </WeekProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
