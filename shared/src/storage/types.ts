/**
 * Platform-agnostic storage adapter interface.
 * Web: pass localStorage
 * Mobile: pass an AsyncStorage sync wrapper
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
