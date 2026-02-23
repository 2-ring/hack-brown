// Feature detection for cross-browser compatibility.
// All branching in the compat layer uses these flags — never browser sniffing.

declare const browser: typeof chrome | undefined;

const _chrome = globalThis.chrome;

/** Firefox exposes `browser.*` with native Promise support */
export const hasNativeBrowserAPI = typeof browser !== 'undefined';

/** The base API object — Firefox `browser` or Chrome/Safari `chrome` */
export const api: typeof chrome = hasNativeBrowserAPI
  ? (browser as typeof chrome)
  : _chrome;

/** chrome.sidePanel (Chrome 114+) */
export const hasSidePanel =
  typeof _chrome !== 'undefined' && 'sidePanel' in _chrome;

/** browser.sidebarAction (Firefox) */
export const hasSidebarAction =
  typeof browser !== 'undefined' &&
  'sidebarAction' in (browser as any);

/** chrome.storage.session (Chrome 102+, Firefox 115+) */
export const hasSessionStorage =
  typeof _chrome !== 'undefined' &&
  typeof _chrome.storage !== 'undefined' &&
  'session' in _chrome.storage;

/** chrome.notifications (not available in Safari extensions) */
export const hasNotifications =
  typeof _chrome !== 'undefined' && 'notifications' in _chrome;

/** chrome.action.openPopup() (Chrome 127+, Firefox 127+) */
export const hasOpenPopup =
  typeof _chrome !== 'undefined' &&
  typeof _chrome.action?.openPopup === 'function';

/** chrome.alarms (all MV3 browsers) */
export const hasAlarms =
  typeof _chrome !== 'undefined' && 'alarms' in _chrome;
