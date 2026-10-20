/**
 * Whether the shortcut line at the bottom of the screen is shown (B, or its
 * buttons). Remembered in this browser, so a player who has learnt the keys
 * isn't shown it again on every visit. Storage may be missing (private
 * windows, blocked site data): then the line simply starts shown.
 */

const KEY = 'duskwood.helpOpen';

export function loadHelpOpen(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveHelpOpen(open: boolean): void {
  try {
    window.localStorage.setItem(KEY, open ? '1' : '0');
  } catch {
    // Storage unavailable: the choice lasts for this visit only.
  }
}
