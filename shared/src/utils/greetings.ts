/**
 * Greeting generator — time-of-day and auth-aware.
 */

type GreetingType = 'authenticated' | 'general' | 'morning' | 'afternoon' | 'evening' | 'lateNight'

interface Greeting {
  text: string
  types: GreetingType[]
}

const GREETINGS: Greeting[] = [
  // Authenticated greetings (require user name)
  { text: "Let's plan, {name}", types: ['authenticated'] },
  { text: "Welcome back, {name}", types: ['authenticated'] },
  { text: "Ready, {name}?", types: ['authenticated'] },
  { text: "What's up, {name}?", types: ['authenticated'] },

  // General greetings (no name needed)
  { text: "Time to organize", types: ['general'] },
  { text: "Drop it in", types: ['general'] },
  { text: "Let's schedule", types: ['general'] },
  { text: "Calendar time", types: ['general'] },
  { text: "Ready to plan?", types: ['general'] },

  // Morning greetings
  { text: "Rise and shine", types: ['morning'] },
  { text: "Morning planning", types: ['morning'] },
  { text: "Coffee & calendars", types: ['morning'] },
  { text: "Fresh schedule", types: ['morning'] },
  { text: "Morning agenda", types: ['morning'] },

  // Afternoon greetings
  { text: "Schedule check", types: ['afternoon'] },
  { text: "Midday planning", types: ['afternoon'] },
  { text: "Afternoon sync", types: ['afternoon'] },
  { text: "What's next?", types: ['afternoon'] },

  // Evening greetings
  { text: "Evening plans?", types: ['evening'] },
  { text: "Planning tomorrow?", types: ['evening'] },
  { text: "Evening agenda", types: ['evening'] },
  { text: "Wrapping up", types: ['evening'] },

  // Late night greetings
  { text: "Late night plans?", types: ['lateNight'] },
  { text: "Midnight planning?", types: ['lateNight'] },
  { text: "Night scheduling", types: ['lateNight'] },
  { text: "Planning instead?", types: ['lateNight'] },
  { text: "Late night hustle", types: ['lateNight'] },
]

function getTimePeriod(): GreetingType {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'lateNight'
}

// Cache to avoid changing greeting on every render
let cachedGreeting: { text: string; userName?: string; timestamp: number } | null = null
const CACHE_TTL_MS = 30_000

export function getGreeting(userName?: string): string {
  const now = Date.now()

  if (cachedGreeting && now - cachedGreeting.timestamp < CACHE_TTL_MS && cachedGreeting.userName === userName) {
    return cachedGreeting.text
  }

  const timePeriod = getTimePeriod()
  const isAuthenticated = !!userName

  const availableGreetings = GREETINGS.filter(greeting => {
    if (greeting.types.includes('authenticated') && !isAuthenticated) {
      return false
    }
    if (greeting.types.includes(timePeriod)) return true
    if (greeting.types.includes('general')) return true
    if (greeting.types.includes('authenticated') && isAuthenticated) return true
    return false
  })

  const greeting = availableGreetings[Math.floor(Math.random() * availableGreetings.length)]

  let text = greeting.text
  if (userName && text.includes('{name}')) {
    text = text.replace('{name}', userName)
  }

  cachedGreeting = { text, userName, timestamp: now }
  return text
}
