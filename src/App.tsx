import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/authContext";
import { WeekProvider } from "./lib/weekContext";
import { UsernameGate } from "./components/UsernameGate";
import { PicksPage } from "./pages/PicksPage";
import { HistoryPage } from "./pages/HistoryPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { StatsPage } from "./pages/StatsPage";
import { AdminPage } from "./pages/AdminPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WeekProvider>
          <UsernameGate>
            <Routes>
              <Route path="/" element={<PicksPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Routes>
          </UsernameGate>
        </WeekProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
