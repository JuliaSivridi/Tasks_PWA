/**
 * H-02 — RRULE builder / parser for Google Calendar recurrence strings.
 * Spec §17.
 */

import { parseISO, getDay, getDate } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RRuleFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type RRuleEnds = 'NEVER' | 'ON_DATE' | 'AFTER_COUNT'

export type MonthlyOption = {
  label: string      // human-readable, e.g. "Monthly on day 15"
  value: string      // BYDAY token, e.g. "2TU" or "" (= by month day)
}

export interface RRuleOptions {
  freq: RRuleFreq
  interval: number
  /** WEEKLY only: ['MO','TU','WE','TH','FR','SA','SU'] subset */
  byDay?: string[]
  /** MONTHLY only: value from monthlyOptions() — "" = by date, else BYDAY token */
  monthlyByDay?: string
  ends: RRuleEnds
  endDate?: string    // 'YYYY-MM-DD', used when ends === 'ON_DATE'
  afterCount?: number // used when ends === 'AFTER_COUNT'
}

export interface ParsedRRule {
  freq: RRuleFreq
  interval: number
  byDay: string[]       // weekday tokens
  monthlyByDay: string  // '' = by day-of-month
  ends: RRuleEnds
  endDate: string
  afterCount: number
}

// ── Weekday index → RRULE token ───────────────────────────────────────────────

const JS_DAY_TO_RRULE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

// ── buildRRule ────────────────────────────────────────────────────────────────

/**
 * Builds an RRULE string suitable for the Google Calendar API
 * `recurrence` array, e.g. `"RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE"`.
 */
export function buildRRule(opts: RRuleOptions): string {
  const parts: string[] = [`FREQ=${opts.freq}`]

  if (opts.interval > 1) {
    parts.push(`INTERVAL=${opts.interval}`)
  }

  if (opts.freq === 'WEEKLY' && opts.byDay && opts.byDay.length > 0) {
    parts.push(`BYDAY=${opts.byDay.join(',')}`)
  }

  if (opts.freq === 'MONTHLY' && opts.monthlyByDay) {
    parts.push(`BYDAY=${opts.monthlyByDay}`)
  }

  if (opts.ends === 'ON_DATE' && opts.endDate) {
    // UNTIL format: YYYYMMDDTHHmmssZ (UTC midnight)
    const until = opts.endDate.replace(/-/g, '') + 'T000000Z'
    parts.push(`UNTIL=${until}`)
  } else if (opts.ends === 'AFTER_COUNT' && opts.afterCount) {
    parts.push(`COUNT=${opts.afterCount}`)
  }

  return `RRULE:${parts.join(';')}`
}

// ── parseRRule ────────────────────────────────────────────────────────────────

/**
 * Parses an RRULE string (with or without the "RRULE:" prefix) back into
 * structured fields.
 */
export function parseRRule(rruleStr: string): ParsedRRule {
  const raw = rruleStr.startsWith('RRULE:') ? rruleStr.slice(6) : rruleStr
  const map: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq !== -1) map[part.slice(0, eq)] = part.slice(eq + 1)
  }

  const freq = (map['FREQ'] ?? 'DAILY') as RRuleFreq
  const interval = map['INTERVAL'] ? parseInt(map['INTERVAL'], 10) : 1
  const byDayRaw = map['BYDAY'] ?? ''

  // Detect if BYDAY is an ordinal (monthly) or a plain weekday list (weekly)
  let byDay: string[] = []
  let monthlyByDay = ''
  if (byDayRaw) {
    // Ordinal tokens contain digits, e.g. "2TU" or "-1SA"
    if (/[-\d]/.test(byDayRaw)) {
      monthlyByDay = byDayRaw
    } else {
      byDay = byDayRaw.split(',')
    }
  }

  // Ends
  let ends: RRuleEnds = 'NEVER'
  let endDate = ''
  let afterCount = 0

  if (map['UNTIL']) {
    ends = 'ON_DATE'
    // Convert YYYYMMDDTHHmmssZ → YYYY-MM-DD
    const u = map['UNTIL']
    endDate = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`
  } else if (map['COUNT']) {
    ends = 'AFTER_COUNT'
    afterCount = parseInt(map['COUNT'], 10)
  }

  return { freq, interval, byDay, monthlyByDay, ends, endDate, afterCount }
}

// ── monthlyOptions ────────────────────────────────────────────────────────────

/**
 * Returns 2-3 human-readable monthly-recurrence options for a given date.
 *
 * Option 1: "Monthly on day N"  (always present)
 * Option 2: "Monthly on the Nth Weekday"
 * Option 3: "Monthly on the last Weekday" (only when applicable, i.e. day > 21)
 */
export function monthlyOptions(dateStr: string): MonthlyOption[] {
  const date = parseISO(dateStr)
  const dayOfMonth = getDate(date)
  const jsDayOfWeek = getDay(date)   // 0=Sun … 6=Sat
  const rruleDay = JS_DAY_TO_RRULE[jsDayOfWeek]

  const ordinal = Math.ceil(dayOfMonth / 7)           // 1–5
  const ordinalLabel = ['', '1st', '2nd', '3rd', '4th', '5th'][ordinal] ?? `${ordinal}th`
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][jsDayOfWeek]

  const options: MonthlyOption[] = [
    {
      label: `Monthly on day ${dayOfMonth}`,
      value: '',   // no BYDAY = Google uses BYMONTHDAY
    },
    {
      label: `Monthly on the ${ordinalLabel} ${dayName}`,
      value: `${ordinal}${rruleDay}`,
    },
  ]

  // Add "last weekday" option when the day is in the last 7 days of typical months
  if (dayOfMonth > 21) {
    options.push({
      label: `Monthly on the last ${dayName}`,
      value: `-1${rruleDay}`,
    })
  }

  return options
}
