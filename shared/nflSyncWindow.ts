/**
 * Whether ESPN sync should run on a dense (gameday) schedule.
 * Uses America/New_York so DST is handled correctly.
 *
 * Windows (ET):
 * - Sunday from 9am (covers London + afternoon / SNF)
 * - Monday from 7pm (MNF)
 * - Tuesday before 2am (MNF past midnight)
 * - Thursday from 7pm (TNF)
 * - Friday before 2am (TNF past midnight)
 */
export function isNflGameWindow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  let hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (!Number.isFinite(hour)) return false;
  if (hour === 24) hour = 0;

  switch (weekday) {
    case "Sun":
      return hour >= 9;
    case "Mon":
      return hour >= 19;
    case "Tue":
      return hour < 2;
    case "Thu":
      return hour >= 19;
    case "Fri":
      return hour < 2;
    default:
      return false;
  }
}
