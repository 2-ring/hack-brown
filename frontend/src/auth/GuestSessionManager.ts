/**
 * GuestSessionManager — static wrapper over the shared instance.
 *
 * The shared package uses an instance class with DI for storage.
 * This module creates a singleton with localStorage and re-exports
 * a static-style class so existing call sites don't need to change.
 */

import { GuestSessionManager as SharedGuestSessionManager } from '@dropcal/shared';

const instance = new SharedGuestSessionManager(localStorage);

export class GuestSessionManager {
  static getGuestSessions() { return instance.getGuestSessions(); }
  static addGuestSession(sessionId: string, accessToken: string) { return instance.addGuestSession(sessionId, accessToken); }
  static getAccessToken(sessionId: string) { return instance.getAccessToken(sessionId); }
  static getSessionCount() { return instance.getSessionCount(); }
  static hasReachedLimit() { return instance.hasReachedLimit(); }
  static getRemainingCount() { return instance.getRemainingCount(); }
  static getSessionIds() { return instance.getSessionIds(); }
  static clearGuestSessions() { return instance.clearGuestSessions(); }
  static isToastDismissed() { return instance.isToastDismissed(); }
  static dismissToast() { return instance.dismissToast(); }
}
