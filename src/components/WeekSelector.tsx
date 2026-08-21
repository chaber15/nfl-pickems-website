import { CaretDown } from "@phosphor-icons/react";
import { buildWeekOptions } from "@shared/weekUtils";
import { useWeek } from "../lib/weekContext";

export function WeekSelector() {
  const { seasonType, week, setWeekSelection } = useWeek();
  const options = buildWeekOptions();
  const value = `${seasonType}:${week}`;

  return (
    <label className="relative inline-flex min-h-11 items-center">
      <span className="sr-only">Select week</span>
      <select
        value={value}
        onChange={(e) => {
          const [st, w] = e.target.value.split(":").map(Number);
          setWeekSelection(st, w);
        }}
        className="appearance-none rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] py-2 pl-4 pr-10 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]"
      >
        {options.map((opt) => (
          <option key={`${opt.seasonType}-${opt.week}`} value={`${opt.seasonType}:${opt.week}`}>
            {opt.label}
          </option>
        ))}
      </select>
      <CaretDown
        size={16}
        weight="bold"
        className="pointer-events-none absolute right-3 text-[var(--text-muted)]"
      />
    </label>
  );
}
