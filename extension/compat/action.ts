// Badge and popup action abstraction.
// chrome.action.openPopup() is Chrome 127+ / Firefox 127+ only — degrades to no-op.

import { api, hasOpenPopup } from './detect';

export const action = {
  setBadgeText(details: { text: string }): void {
    api.action.setBadgeText(details);
  },

  setBadgeBackgroundColor(details: { color: string }): void {
    api.action.setBadgeBackgroundColor(details);
  },

  /** Try to programmatically open the popup. No-ops on browsers that don't support it. */
  async tryOpenPopup(): Promise<void> {
    if (hasOpenPopup) {
      try {
        await api.action.openPopup();
      } catch {
        // Gesture required or other restriction — silently ignore
      }
    }
  },
};
