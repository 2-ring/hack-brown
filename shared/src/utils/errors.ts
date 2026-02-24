/**
 * Friendly error message mapping.
 * Maps raw error strings to casual, user-friendly messages.
 */

const ERROR_MESSAGE_MAP: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /No events found/i, message: "We couldn't find any events in there. Try rephrasing or adding more details!" },
  { pattern: /empty/i, message: "This file seems to be empty. Pick a different one!" },
  { pattern: /Unsupported file type/i, message: "Sorry, that file type isn't supported! Try something else." },
  { pattern: /too large|too long/i, message: "Whoa, that's too big! Try something shorter or split it up." },
  { pattern: /timed? ?out|timeout/i, message: "That took a bit too long. Mind trying again?" },
  { pattern: /not connected|not authenticated|401/i, message: "Looks like your calendar isn't connected. Try signing in again!" },
  { pattern: /No content found|Failed to fetch URL/i, message: "We couldn't grab anything from that link. Double-check the URL and try again!" },
  { pattern: /rate limit|429|Too Many Requests/i, message: "Whoa, slow down! Give it a sec and try again." },
  { pattern: /network|Failed to fetch$/i, message: "Hmm, we're having trouble connecting. Check your internet and try again!" },
]

/**
 * Convert a raw error into a casual, user-friendly message.
 * Falls back to the generic "Oops!" message when no specific pattern matches.
 */
export function getFriendlyErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  for (const { pattern, message } of ERROR_MESSAGE_MAP) {
    if (pattern.test(raw)) return message
  }
  return "Oops! Something went wrong. Mind trying that again?"
}
