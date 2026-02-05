/**
 * Manages guest sessions in localStorage.
 * Tracks session count, IDs, and enforces 3-session limit.
 */

const GUEST_STORAGE_KEY = 'dropcal_guest_sessions';
const GUEST_LIMIT = 3;
const TOAST_DISMISSED_KEY = 'dropcal_guest_toast_dismissed';

interface GuestSession {
  id: string;
  timestamp: number;
  accessToken: string; // Secure token for session access
}

interface GuestStorage {
  sessions: GuestSession[];
  count: number;
}

export class GuestSessionManager {
  static getGuestSessions(): GuestStorage {
    const stored = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!stored) {
      return { sessions: [], count: 0 };
    }
    return JSON.parse(stored);
  }

  static addGuestSession(sessionId: string, accessToken: string): void {
    const storage = this.getGuestSessions();
    storage.sessions.push({
      id: sessionId,
      timestamp: Date.now(),
      accessToken
    });
    storage.count += 1;
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(storage));
  }

  static getAccessToken(sessionId: string): string | null {
    const storage = this.getGuestSessions();
    const session = storage.sessions.find(s => s.id === sessionId);
    return session?.accessToken || null;
  }

  static getSessionCount(): number {
    return this.getGuestSessions().count;
  }

  static hasReachedLimit(): boolean {
    return this.getSessionCount() >= GUEST_LIMIT;
  }

  static getRemainingCount(): number {
    return Math.max(0, GUEST_LIMIT - this.getSessionCount());
  }

  static getSessionIds(): string[] {
    return this.getGuestSessions().sessions.map((s) => s.id);
  }

  static clearGuestSessions(): void {
    localStorage.removeItem(GUEST_STORAGE_KEY);
  }

  static isToastDismissed(): boolean {
    return localStorage.getItem(TOAST_DISMISSED_KEY) === 'true';
  }

  static dismissToast(): void {
    localStorage.setItem(TOAST_DISMISSED_KEY, 'true');
  }
}
