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

const TUTORIAL_KEY = "pickems_leaderboard_lean_tutorial_v1";

export function readTutorialDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTutorialDone() {
  try {
    localStorage.setItem(TUTORIAL_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Snapshot of currently hidden usernames (lowercase). */
export function getHiddenCrowdNames(): Set<string> {
  return readHidden();
}

/** Usernames currently visible on the lean (not hidden). */
export function getVisibleCrowdUsernames(allUsernames: string[]): string[] {
  const hidden = getHiddenCrowdNames();
  return allUsernames.filter((u) => !hidden.has(u.toLowerCase()));
}
