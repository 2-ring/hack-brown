// Unified storage API with a fallback for browsers without chrome.storage.session.
// Safari (older versions) lacks session storage — we emulate it by namespacing
// keys in local storage with a "__session:" prefix and clearing on startup.

import { api, hasSessionStorage } from './detect';

const SESSION_PREFIX = '__session:';

// Minimal interface for the storage methods we actually use.
// Avoids fighting with chrome.storage.StorageArea's complex overloads.
export interface SimpleStorageArea {
  get(keys: string | string[] | null, callback: (items: Record<string, any>) => void): void;
  set(items: Record<string, any>, callback?: () => void): void;
  remove(keys: string | string[], callback?: () => void): void;
  clear(callback?: () => void): void;
  onChanged: {
    addListener(callback: (changes: Record<string, chrome.storage.StorageChange>, areaName?: string) => void): void;
  };
}

function prefixKeys(keys: string | string[] | Record<string, any>): string[] {
  if (typeof keys === 'string') return [`${SESSION_PREFIX}${keys}`];
  if (Array.isArray(keys)) return keys.map((k) => `${SESSION_PREFIX}${k}`);
  return Object.keys(keys).map((k) => `${SESSION_PREFIX}${k}`);
}

function prefixRecord(items: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(items)) {
    out[`${SESSION_PREFIX}${k}`] = v;
  }
  return out;
}

function unprefixRecord(result: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(result)) {
    if (k.startsWith(SESSION_PREFIX)) {
      out[k.slice(SESSION_PREFIX.length)] = v;
    }
  }
  return out;
}

// ===== Session fallback change listeners =====

type StorageChangeCallback = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName?: string,
) => void;

const sessionFallbackListeners = new Set<StorageChangeCallback>();
let localChangeListenerInstalled = false;

function ensureLocalChangeListener(): void {
  if (localChangeListenerInstalled) return;
  localChangeListenerInstalled = true;

  api.storage.local.onChanged.addListener((changes) => {
    if (sessionFallbackListeners.size === 0) return;

    const sessionChanges: Record<string, chrome.storage.StorageChange> = {};
    let hasChanges = false;

    for (const [key, change] of Object.entries(changes)) {
      if (key.startsWith(SESSION_PREFIX)) {
        sessionChanges[key.slice(SESSION_PREFIX.length)] = change;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      for (const listener of sessionFallbackListeners) {
        listener(sessionChanges, 'session');
      }
    }
  });
}

// ===== Fallback implementation =====

const sessionFallback: SimpleStorageArea = {
  get(keys, callback) {
    const prefixed = keys === null ? null : prefixKeys(keys);
    api.storage.local.get(prefixed, (result) => {
      callback(unprefixRecord(result));
    });
  },

  set(items, callback) {
    if (callback) {
      api.storage.local.set(prefixRecord(items), callback);
    } else {
      api.storage.local.set(prefixRecord(items));
    }
  },

  remove(keys, callback) {
    const prefixed = prefixKeys(keys);
    if (callback) {
      api.storage.local.remove(prefixed, callback);
    } else {
      api.storage.local.remove(prefixed);
    }
  },

  clear(callback) {
    api.storage.local.get(null, (all) => {
      const sessionKeys = Object.keys(all).filter((k) => k.startsWith(SESSION_PREFIX));
      if (sessionKeys.length > 0) {
        if (callback) {
          api.storage.local.remove(sessionKeys, callback);
        } else {
          api.storage.local.remove(sessionKeys);
        }
      } else {
        callback?.();
      }
    });
  },

  onChanged: {
    addListener(callback: StorageChangeCallback) {
      ensureLocalChangeListener();
      sessionFallbackListeners.add(callback);
    },
  },
};

/** Clear ephemeral session keys on service worker startup (mimics session storage behavior). */
export function clearSessionFallback(): void {
  if (!hasSessionStorage) {
    sessionFallback.clear();
  }
}

// ===== Exported storage object =====

// Wrap the real chrome.storage.session to match our SimpleStorageArea interface.
// This avoids type issues with chrome's complex overloaded signatures.
function wrapNativeSession(): SimpleStorageArea {
  const native = api.storage.session;
  return {
    get(keys, callback) { native.get(keys, callback); },
    set(items, callback) { if (callback) native.set(items, callback); else native.set(items); },
    remove(keys, callback) { if (callback) native.remove(keys, callback); else native.remove(keys); },
    clear(callback) { if (callback) native.clear(callback); else native.clear(); },
    onChanged: native.onChanged,
  };
}

export const storage = {
  local: api.storage.local,
  session: hasSessionStorage ? wrapNativeSession() : sessionFallback,
  onChanged: api.storage.onChanged,
};
