import { storageGet, storageSet } from "./storage";

const HIDDEN_KEY = "pickems_crowd_hidden";

function readHidden(): Set<string> {
  try {
    const raw = storageGet(HIDDEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeHidden(hidden: Set<string>) {
  storageSet(HIDDEN_KEY, JSON.stringify([...hidden]));
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
  return storageGet(TUTORIAL_KEY) === "1";
}

export function markTutorialDone() {
  storageSet(TUTORIAL_KEY, "1");
}

/** Usernames currently visible on the lean (not hidden). */
export function getVisibleCrowdUsernames(allUsernames: string[]): string[] {
  const hidden = readHidden();
  return allUsernames.filter((u) => !hidden.has(u.toLowerCase()));
}
