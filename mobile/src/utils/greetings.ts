// Greeting types
type GreetingType = 'authenticated' | 'general' | 'morning' | 'afternoon' | 'evening' | 'lateNight'

interface Greeting {
  text: string
  types: GreetingType[]
}

// Greeting registry - easily extensible
const GREETINGS: Greeting[] = [
  // Authenticated greetings (require user name)
  { text: "Let's plan, {name}", types: ['authenticated'] },
  { text: "Welcome back, {name}", types: ['authenticated'] },
  { text: "Ready to drop it in, {name}?", types: ['authenticated'] },
  { text: "What's on the agenda, {name}?", types: ['authenticated'] },

  // General greetings (no name needed)
  { text: "Time to organize", types: ['general'] },
  { text: "Drop it in", types: ['general'] },
  { text: "Let's get scheduling", types: ['general'] },
  { text: "Your calendar awaits", types: ['general'] },
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
  { text: "Evening plans", types: ['evening'] },
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

// Get current time period
function getTimePeriod(): GreetingType {
  const hour = new Date().getHours()

  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'lateNight'
}

/**
 * Get random greeting based on context
 * @param userName - Optional user name for personalized greetings
 * @returns Greeting text
 */
export function getGreeting(userName?: string): string {
  const timePeriod = getTimePeriod()
  const isAuthenticated = !!userName

  // Filter available greetings
  const availableGreetings = GREETINGS.filter(greeting => {
    // Check if greeting matches current context
    if (greeting.types.includes('authenticated') && !isAuthenticated) {
      return false
    }

    // Time-based greetings match current time
    if (greeting.types.includes(timePeriod)) {
      return true
    }

    // General and authenticated greetings always available
    if (greeting.types.includes('general')) {
      return true
    }

    if (greeting.types.includes('authenticated') && isAuthenticated) {
      return true
    }

    return false
  })

  // Pick random greeting
  const greeting = availableGreetings[Math.floor(Math.random() * availableGreetings.length)]

  // Replace {name} with actual name
  if (userName && greeting.text.includes('{name}')) {
    return greeting.text.replace('{name}', userName)
  }

  return greeting.text
}
