// Content script that runs on dropcal.ai / www.dropcal.ai
// Reads the Supabase session from localStorage and sends it to the extension
//
// Note: This is bundled as IIFE (not ES module), so compat/ is not importable.
// Content scripts only use chrome.runtime.sendMessage which works identically
// across all browsers (Firefox's chrome.* compat shim covers it).

declare const browser: { runtime: typeof chrome.runtime } | undefined;

const runtime =
  typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;

const SUPABASE_STORAGE_KEY = 'sb-bdpiluwfhfmitvrcdrlr-auth-token';
const THEME_STORAGE_KEY = 'theme-mode';

let lastSentToken: string | null = null;
let lastSentTheme: string | null = null;

function readAndSendToken(): void {
  try {
    const raw = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (!raw) {
      if (lastSentToken !== null) {
        lastSentToken = null;
        runtime.sendMessage({ type: 'AUTH_SIGNED_OUT' }).catch(() => {});
      }
      return;
    }

    const session = JSON.parse(raw);
    const accessToken = session?.access_token;
    const refreshToken = session?.refresh_token;
    const expiresAt = session?.expires_at;

    if (accessToken && refreshToken && expiresAt) {
      // Only send if token changed (avoid spamming the background)
      if (accessToken !== lastSentToken) {
        lastSentToken = accessToken;
        runtime.sendMessage({
          type: 'AUTH_TOKEN',
          accessToken,
          refreshToken,
          expiresAt,
        }).catch(() => {});
      }
    } else if (lastSentToken !== null) {
      lastSentToken = null;
      runtime.sendMessage({ type: 'AUTH_SIGNED_OUT' }).catch(() => {});
    }
  } catch {
    // localStorage read or sendMessage failed — ignore
  }
}

function readAndSendTheme(): void {
  try {
    const theme = localStorage.getItem(THEME_STORAGE_KEY) || 'auto';
    if (theme !== lastSentTheme) {
      lastSentTheme = theme;
      runtime.sendMessage({ type: 'THEME_CHANGED', themeMode: theme }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

// Send token and theme on page load
readAndSendToken();
readAndSendTheme();

// Rapid polling for the first 15 seconds to catch post-OAuth token writes
// (Supabase processes the OAuth hash fragment async after page load)
let rapidPollCount = 0;
const rapidPoll = setInterval(() => {
  readAndSendToken();
  readAndSendTheme();
  rapidPollCount++;
  if (rapidPollCount >= 15) {
    clearInterval(rapidPoll);
  }
}, 1000);

// Watch for cross-tab localStorage changes
window.addEventListener('storage', (event) => {
  if (event.key === SUPABASE_STORAGE_KEY) {
    readAndSendToken();
  }
  if (event.key === THEME_STORAGE_KEY) {
    readAndSendTheme();
  }
});

// Steady-state poll every 5s to catch same-tab token refreshes and theme changes
setInterval(() => {
  readAndSendToken();
  readAndSendTheme();
}, 5000);
