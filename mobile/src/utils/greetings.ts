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

  // General greetings (no name needed)
  { text: "Time to organize", types: ['general'] },

  // Time-based greetings
  { text: "Rise and shine", types: ['morning'] },
  { text: "Late night scheduling?", types: ['lateNight'] },
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
