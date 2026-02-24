/**
 * Manages guest sessions via an injected storage adapter.
 * Tracks session count, IDs, and enforces 3-session limit.
 */

import type { StorageAdapter } from '../storage/types';

const GUEST_STORAGE_KEY = 'dropcal_guest_sessions';
const GUEST_LIMIT = 3;
const TOAST_DISMISSED_KEY = 'dropcal_guest_toast_dismissed';

interface GuestSession {
  id: string;
  timestamp: number;
  accessToken: string;
}

interface GuestStorage {
  sessions: GuestSession[];
  count: number;
}

export class GuestSessionManager {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  getGuestSessions(): GuestStorage {
    const stored = this.storage.getItem(GUEST_STORAGE_KEY);
    if (!stored) {
      return { sessions: [], count: 0 };
    }
    return JSON.parse(stored);
  }

  addGuestSession(sessionId: string, accessToken: string): void {
    const storage = this.getGuestSessions();
    storage.sessions.push({
      id: sessionId,
      timestamp: Date.now(),
      accessToken,
    });
    storage.count += 1;
    this.storage.setItem(GUEST_STORAGE_KEY, JSON.stringify(storage));
  }

  getAccessToken(sessionId: string): string | null {
    const storage = this.getGuestSessions();
    const session = storage.sessions.find(s => s.id === sessionId);
    return session?.accessToken || null;
  }

  getSessionCount(): number {
    return this.getGuestSessions().count;
  }

  hasReachedLimit(): boolean {
    return this.getSessionCount() >= GUEST_LIMIT;
  }

  getRemainingCount(): number {
    return Math.max(0, GUEST_LIMIT - this.getSessionCount());
  }

  getSessionIds(): string[] {
    return this.getGuestSessions().sessions.map(s => s.id);
  }

  clearGuestSessions(): void {
    this.storage.removeItem(GUEST_STORAGE_KEY);
  }

  isToastDismissed(): boolean {
    return this.storage.getItem(TOAST_DISMISSED_KEY) === 'true';
  }

  dismissToast(): void {
    this.storage.setItem(TOAST_DISMISSED_KEY, 'true');
  }
}
