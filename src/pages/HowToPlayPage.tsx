import { AppShell } from "../components/AppShell";
import { NFL_LOGO_SRC } from "../lib/teamLogos";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
      <h3 className="mb-3 text-base font-bold tracking-wide text-[var(--text-primary)]">{title}</h3>
      <div className="space-y-3 text-sm leading-relaxed text-[var(--text-muted)]">{children}</div>
    </section>
  );
}

export function HowToPlayPage() {
  return (
    <AppShell showWeekSelector={false}>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-4">
          <img src={NFL_LOGO_SRC} alt="" className="h-12 w-auto object-contain" />
          <div>
            <h2 className="font-display text-3xl sm:text-4xl">How to Play</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Against the spread. No real money.</p>
          </div>
        </div>

        <Section title="1. Make your picks">
          <p>
            Each game shows the <strong className="text-[var(--text-primary)]">favorite</strong> and{" "}
            <strong className="text-[var(--text-primary)]">underdog</strong> with the spread. Tap one side
            before kickoff.
          </p>
          <p>
            If you leave a game blank, it counts as <strong className="text-[var(--accent-red)]">wrong</strong>{" "}
            once the game locks.
          </p>
        </Section>

        <Section title="2. Confidence bets (★)">
          <p>
            In the regular season, mark exactly{" "}
            <strong className="text-[var(--accent-gold)]">5 games</strong> as confidence bets each week.
            Those are the only games that count toward the units / profit and loss (P&amp;L) board.
          </p>
          <p>
            In the <strong className="text-[var(--text-primary)]">playoffs</strong>, every game you pick
            counts for P&amp;L — no ★ limit.
          </p>
        </Section>

        <Section title="3. Scoring">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-[var(--text-primary)]">Win %</strong> — correct against-the-spread
              (ATS) picks ÷ final games. Missed picks count against you.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Confidence P&amp;L</strong> — units won/lost
              on your ★ bets using the posted spread juice (vig). Example: −125 risks 1.25 to win 1; +125
              risks 1 to win 1.25. Weeks without exactly 5 ★ bets are skipped (except playoffs).
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Hypothetical P&amp;L</strong> (on Stats) —
              what if every pick counted at odds, with −1 unit for each missed game.
            </li>
          </ul>
        </Section>

        <Section title="4. Leaderboards">
          <p>
            The main standings are <strong className="text-[var(--text-primary)]">win percentage</strong>.
            There&apos;s a second board for{" "}
            <strong className="text-[var(--text-primary)]">confidence units</strong> so big swings and
            careful ★ picks both show up.
          </p>
        </Section>

        <Section title="5. See the room (live)">
          <p>
            On <strong className="text-[var(--text-primary)]">Picks</strong>, a thin bar under each game
            shows the Away / Home lean — tap or hover it for names. Updates as people save. No hiding
            until kickoff. ★ marks a confidence bet.
          </p>
        </Section>

        <Section title="Tips">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Spread and juice freeze at <strong className="text-[var(--text-primary)]">8:00 AM Eastern on
              Wednesday</strong> so everyone plays the same line. Scores still update after that.
            </li>
            <li>Picks lock at kickoff — you can change them until then.</li>
            <li>Username only — pick a name the family will recognize.</li>
          </ul>
        </Section>
      </div>
    </AppShell>
  );
}
