// Cross-browser notification abstraction.
// Safari extensions lack chrome.notifications — gracefully no-ops there.

import { api, hasNotifications } from './detect';

export const notifications = {
  create(
    id: string,
    options: { type: 'basic'; iconUrl: string; title: string; message: string },
  ): void {
    if (hasNotifications) {
      api.notifications.create(id, options);
    }
  },

  onClicked: hasNotifications
    ? api.notifications.onClicked
    : { addListener: (_cb: (id: string) => void) => {} },
};
