const HIDDEN_KEY = "pickems_crowd_hidden";

function readHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeHidden(hidden: Set<string>) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
}

/** True unless the user opted this username out of lean name lists. */
export function isCrowdNameVisible(username: string): boolean {
  return !readHidden().has(username.toLowerCase());
}

export function setCrowdNameVisible(username: string, visible: boolean) {
  const hidden = readHidden();
  const key = username.toLowerCase();
  if (visible) hidden.delete(key);
  else hidden.add(key);
  writeHidden(hidden);
}

/** Snapshot of currently hidden usernames (lowercase). */
export function getHiddenCrowdNames(): Set<string> {
  return readHidden();
}
