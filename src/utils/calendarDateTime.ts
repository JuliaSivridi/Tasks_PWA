/**
 * H-01 — Calendar date/time helpers for Google Calendar API (spec §7.2).
 * Builds RFC 3339 EventDateTime objects and parses them back.
 */

import { format, parseISO, addHours, addDays } from 'date-fns'
import type { EventDateTime, CalendarEventDto } from '@/types/calendarEvent'

// Timezone of the user's device
const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * Build a Google Calendar EventDateTime for an event start/end field.
 *  - All-day  (no time): `{ date: "YYYY-MM-DD" }`
 *  - Timed:              `{ dateTime: "<ISO-with-offset>", timeZone: "<tz>" }`
 */
export function buildEventDateTime(date: string, time: string): EventDateTime {
  if (!time) {
    return { date }
  }
  // Construct a local ISO string and convert to RFC 3339 with offset
  const localIso = `${date}T${time}:00`
  const d = new Date(localIso)
  // format with timezone offset: e.g. "2025-04-16T09:30:00+03:00"
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const mm = String(Math.abs(offset) % 60).padStart(2, '0')
  const dateTime = `${localIso}${sign}${hh}:${mm}`
  return { dateTime, timeZone: USER_TZ }
}

/**
 * Build the end EventDateTime from start + optional end time.
 *  - All-day (no startTime): next calendar day
 *  - Timed + no endTime:     startTime + 1 hour
 *  - endTime ≤ startTime:    startTime + 1 hour (clamp)
 *  - else:                   endTime as-is
 */
export function buildEndDateTime(
  startDate: string,
  startTime: string,
  endTime: string,
): EventDateTime {
  // All-day
  if (!startTime) {
    const next = format(addDays(parseISO(startDate), 1), 'yyyy-MM-dd')
    return { date: next }
  }

  // No end time or end ≤ start → +1 hour
  if (!endTime || endTime <= startTime) {
    const d = addHours(new Date(`${startDate}T${startTime}:00`), 1)
    const newTime = format(d, 'HH:mm')
    return buildEventDateTime(startDate, newTime)
  }

  return buildEventDateTime(startDate, endTime)
}

/**
 * Parse a Google Calendar EventDateTime back into structured fields.
 */
export function parseEventDateTimeFromDto(dto: CalendarEventDto): {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  isAllDay: boolean
} {
  const { start, end } = dto

  if (start.date) {
    // All-day
    return {
      startDate: start.date,
      startTime: '',
      endDate: end?.date ?? start.date,
      endTime: '',
      isAllDay: true,
    }
  }

  // Timed — parse the dateTime string
  const startDt = new Date(start.dateTime!)
  const startDate = format(startDt, 'yyyy-MM-dd')
  const startTime = format(startDt, 'HH:mm')

  let endDate = startDate
  let endTime = ''
  if (end?.dateTime) {
    const endDt = new Date(end.dateTime)
    endDate = format(endDt, 'yyyy-MM-dd')
    endTime = format(endDt, 'HH:mm')
  }

  return { startDate, startTime, endDate, endTime, isAllDay: false }
}
