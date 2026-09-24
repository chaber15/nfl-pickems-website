/** Plain browser confirm — reliable on every phone and needs no extra UI. */
export function confirmAction(message: string): boolean {
  try {
    return window.confirm(message);
  } catch {
    return false;
  }
}

export function confirmSwitchUser(): boolean {
  return confirmAction(
    "Switch player? You'll go back to the sign-in screen and can type any username to continue.",
  );
}
