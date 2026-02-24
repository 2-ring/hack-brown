/**
 * RRULE utility library for recurring calendar events.
 *
 * Handles parsing, building, and formatting RFC 5545 RRULE strings.
 */

// ── Types ──

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type EndType = 'never' | 'until' | 'count'
export type DayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

export interface RecurrenceConfig {
  frequency: RecurrenceFrequency
  interval: number
  days: DayCode[]
  monthDay?: number
  endType: EndType
  endDate?: string       // YYYY-MM-DD
  count?: number
}

// ── Constants ──

export const ALL_DAYS: DayCode[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

export const DAY_LABELS: Record<DayCode, string> = {
  MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
}

export const DAY_SHORT: Record<DayCode, string> = {
  MO: 'M', TU: 'T', WE: 'W', TH: 'Th', FR: 'F', SA: 'Sa', SU: 'Su',
}

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
}

// ── Defaults ──

export function getDefaultConfig(
  frequency: RecurrenceFrequency,
  startDateTime?: string
): RecurrenceConfig {
  const config: RecurrenceConfig = {
    frequency,
    interval: 1,
    days: [],
    endType: 'never',
  }

  if (frequency === 'WEEKLY') {
    const dayCode = getDayCodeFromDate(startDateTime)
    config.days = dayCode ? [dayCode] : ['MO']
  }

  if (frequency === 'MONTHLY') {
    config.monthDay = startDateTime ? new Date(startDateTime).getDate() : 1
  }

  return config
}

// ── Parse RRULE → Config ──

export function parseRRule(rules: string[]): RecurrenceConfig {
  if (!rules || rules.length === 0) {
    return getDefaultConfig('WEEKLY')
  }

  let rule = rules[0]
  if (rule.startsWith('RRULE:')) {
    rule = rule.slice(6)
  }

  const params: Record<string, string> = {}
  for (const part of rule.split(';')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx > 0) {
      params[part.slice(0, eqIdx)] = part.slice(eqIdx + 1)
    }
  }

  const frequency = (params.FREQ || 'WEEKLY') as RecurrenceFrequency
  const interval = params.INTERVAL ? parseInt(params.INTERVAL, 10) : 1

  const days: DayCode[] = params.BYDAY
    ? (params.BYDAY.split(',').filter(d => ALL_DAYS.includes(d as DayCode)) as DayCode[])
    : []

  const monthDay = params.BYMONTHDAY ? parseInt(params.BYMONTHDAY, 10) : undefined

  let endType: EndType = 'never'
  let endDate: string | undefined
  let count: number | undefined

  if (params.UNTIL) {
    endType = 'until'
    const u = params.UNTIL
    endDate = u.length >= 8 ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` : undefined
  } else if (params.COUNT) {
    endType = 'count'
    count = parseInt(params.COUNT, 10)
  }

  return { frequency, interval, days, monthDay, endType, endDate, count }
}

// ── Build Config → RRULE ──

export function buildRRule(config: RecurrenceConfig): string[] {
  const parts: string[] = [`FREQ=${config.frequency}`]

  if (config.interval > 1) {
    parts.push(`INTERVAL=${config.interval}`)
  }

  if (config.frequency === 'WEEKLY' && config.days.length > 0) {
    parts.push(`BYDAY=${config.days.join(',')}`)
  }

  if (config.frequency === 'MONTHLY' && config.monthDay) {
    parts.push(`BYMONTHDAY=${config.monthDay}`)
  }

  if (config.endType === 'until' && config.endDate) {
    parts.push(`UNTIL=${config.endDate.replace(/-/g, '')}`)
  } else if (config.endType === 'count' && config.count) {
    parts.push(`COUNT=${config.count}`)
  }

  return [`RRULE:${parts.join(';')}`]
}

// ── Format RRULE → Human-readable ──

export function formatRecurrence(rules: string[]): string {
  if (!rules || rules.length === 0) return 'Does not repeat'

  const config = parseRRule(rules)
  return formatConfig(config)
}

export function formatConfig(config: RecurrenceConfig): string {
  const { frequency, interval, days, monthDay, endType, endDate, count } = config

  let text = ''

  if (interval === 1) {
    text = FREQUENCY_LABELS[frequency]
  } else {
    const unitMap: Record<RecurrenceFrequency, string> = {
      DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years',
    }
    text = `Every ${interval} ${unitMap[frequency]}`
  }

  if (frequency === 'WEEKLY' && days.length > 0) {
    if (days.length === 5 && !days.includes('SA') && !days.includes('SU')) {
      text += ' on weekdays'
    } else if (days.length === 7) {
      text = interval === 1 ? 'Daily' : text
    } else {
      text += ` on ${days.map(d => DAY_LABELS[d]).join(', ')}`
    }
  }

  if (frequency === 'MONTHLY' && monthDay) {
    text += ` on day ${monthDay}`
  }

  if (endType === 'until' && endDate) {
    const d = new Date(endDate + 'T00:00:00')
    const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    text += ` until ${formatted}`
  } else if (endType === 'count' && count) {
    text += `, ${count} time${count > 1 ? 's' : ''}`
  }

  return text
}

// ── Helpers ──

function getDayCodeFromDate(dateTime?: string): DayCode | null {
  if (!dateTime) return null
  try {
    const d = new Date(dateTime)
    const jsDay = d.getDay()
    const map: DayCode[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
    return map[jsDay] || null
  } catch {
    return null
  }
}
