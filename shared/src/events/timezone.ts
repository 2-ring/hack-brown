/**
 * Timezone utility library for calendar events.
 *
 * Generates IANA timezone list from Intl APIs, formats display labels,
 * and provides search/filter functionality for the timezone picker.
 */

// ── Types ──

export interface TimezoneOption {
  /** IANA timezone identifier, e.g., "America/New_York" */
  iana: string
  /** UTC offset in minutes, e.g., -300 for EST */
  offsetMinutes: number
  /** Formatted label, e.g., "(GMT-05:00) New York" */
  label: string
  /** Long timezone name, e.g., "Eastern Standard Time" */
  longName: string
  /** Current time in this timezone, e.g., "1 PM" */
  currentTime: string
  /** Short offset label, e.g., "GMT-5" */
  shortOffset: string
  /** City extracted from IANA, e.g., "New York" */
  city: string
  /** Region from IANA path, e.g., "America" */
  region: string
  /** Lowercase searchable terms */
  searchTerms: string
}

// ── Common Abbreviation Map ──

const COMMON_ABBREVIATIONS: Record<string, string[]> = {
  'America/New_York': ['est', 'edt', 'eastern'],
  'America/Chicago': ['cst', 'cdt', 'central'],
  'America/Denver': ['mst', 'mdt', 'mountain'],
  'America/Los_Angeles': ['pst', 'pdt', 'pacific'],
  'America/Anchorage': ['akst', 'akdt', 'alaska'],
  'Pacific/Honolulu': ['hst', 'hawaii'],
  'Europe/London': ['gmt', 'bst', 'british', 'uk'],
  'Europe/Paris': ['cet', 'cest', 'central european'],
  'Europe/Berlin': ['cet', 'cest', 'central european'],
  'Europe/Moscow': ['msk', 'moscow'],
  'Asia/Tokyo': ['jst', 'japan'],
  'Asia/Shanghai': ['cst', 'china', 'beijing'],
  'Asia/Kolkata': ['ist', 'india', 'mumbai'],
  'Asia/Dubai': ['gst', 'gulf'],
  'Asia/Singapore': ['sgt', 'singapore'],
  'Asia/Seoul': ['kst', 'korea'],
  'Australia/Sydney': ['aest', 'aedt', 'australian eastern'],
  'Australia/Perth': ['awst', 'australian western'],
  'Pacific/Auckland': ['nzst', 'nzdt', 'new zealand'],
  'America/Sao_Paulo': ['brt', 'brazil'],
  'America/Toronto': ['est', 'edt', 'eastern'],
}

// ── Internal Helpers ──

function getOffsetMinutes(iana: string, date: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(date)
    const tzPart = parts.find(p => p.type === 'timeZoneName')
    if (!tzPart || tzPart.value === 'GMT') return 0

    const match = tzPart.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
    if (!match) return 0

    const sign = match[1] === '+' ? 1 : -1
    const hours = parseInt(match[2], 10)
    const minutes = match[3] ? parseInt(match[3], 10) : 0
    return sign * (hours * 60 + minutes)
  } catch {
    return 0
  }
}

function formatOffsetString(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hours = Math.floor(abs / 60).toString().padStart(2, '0')
  const mins = (abs % 60).toString().padStart(2, '0')
  return `GMT${sign}${hours}:${mins}`
}

function getCityName(iana: string): string {
  const city = iana.split('/').pop()?.replace(/_/g, ' ') || iana
  return city
}

function getRegion(iana: string): string {
  const parts = iana.split('/')
  return parts[0].replace(/_/g, ' ')
}

function getLongTimezoneName(iana: string, date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'long',
    })
    const parts = formatter.formatToParts(date)
    return parts.find(p => p.type === 'timeZoneName')?.value || getCityName(iana)
  } catch {
    return getCityName(iana)
  }
}

function getCurrentTime(iana: string, date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date)
  } catch {
    return ''
  }
}

function formatShortOffset(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'GMT+0'
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hours = Math.floor(abs / 60)
  const mins = abs % 60
  return mins === 0 ? `GMT${sign}${hours}` : `GMT${sign}${hours}:${mins.toString().padStart(2, '0')}`
}

function buildSearchTerms(iana: string): string {
  const parts = iana.toLowerCase().replace(/\//g, ' ').replace(/_/g, ' ')
  const abbreviations = COMMON_ABBREVIATIONS[iana]?.join(' ') || ''
  return `${parts} ${abbreviations}`.trim()
}

// ── Memoized List ──

let _cachedList: TimezoneOption[] | null = null

// ── Public API ──

export function getTimezoneList(): TimezoneOption[] {
  if (_cachedList) return _cachedList

  const zones = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : []

  if (zones.length === 0) return []

  const now = new Date()

  const options: TimezoneOption[] = zones.map(iana => {
    const offsetMinutes = getOffsetMinutes(iana, now)
    const offsetStr = formatOffsetString(offsetMinutes)
    const city = getCityName(iana)
    const label = `(${offsetStr}) ${city}`
    const longName = getLongTimezoneName(iana, now)
    const currentTime = getCurrentTime(iana, now)
    const shortOffset = formatShortOffset(offsetMinutes)
    const region = getRegion(iana)
    const searchTerms = buildSearchTerms(iana)
    return { iana, offsetMinutes, label, longName, currentTime, shortOffset, city, region, searchTerms }
  })

  options.sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.iana.localeCompare(b.iana))

  _cachedList = options
  return options
}

export function formatTimezoneCompact(iana: string): string {
  if (!iana) return ''
  return getCityName(iana)
}

export function formatTimezoneDisplay(iana: string): string {
  if (!iana) return ''
  const offsetMinutes = getOffsetMinutes(iana, new Date())
  const offsetStr = formatOffsetString(offsetMinutes)
  const city = getCityName(iana)
  return `(${offsetStr}) ${city}`
}

export function filterTimezones(list: TimezoneOption[], query: string): TimezoneOption[] {
  if (!query.trim()) return list
  const q = query.toLowerCase()
  return list
    .filter(tz => tz.searchTerms.includes(q) || tz.label.toLowerCase().includes(q))
    .slice(0, 15)
}
