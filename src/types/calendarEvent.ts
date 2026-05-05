/** A single event instance as stored in Dexie and kept in calendarStore. */
export interface CalendarEvent {
  id: string
  calendarId: string
  calendarName: string    // denormalised at fetch time from CalendarItem.summary
  calendarColor: string   // hex, e.g. "#039be5"
  title: string
  startDate: string       // "YYYY-MM-DD"
  startTime: string       // "HH:MM" or "" (all-day)
  endTime: string         // "HH:MM" or ""
  isAllDay: boolean
  recurringEventId: string | null   // non-null → this is a recurring instance
}

/** A calendar entry from the user's calendar list. */
export interface CalendarItem {
  id: string
  summary: string
  color: string           // hex background color
  isSelected: boolean     // whether the calendar is selected in Google Calendar UI
  accessRole: string      // "owner" | "writer" | "reader" | "freeBusyReader"
}

// ── Raw DTO shapes from the Google Calendar API ─────────────────────────────

export interface EventDateTime {
  date?: string        // all-day: "YYYY-MM-DD"
  dateTime?: string    // timed: ISO 8601 with offset
  timeZone?: string
}

export interface CalendarEventDto {
  id: string
  summary?: string
  start: EventDateTime
  end?: EventDateTime
  recurringEventId?: string
  recurrence?: string[]   // e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO"]
  status?: string         // "confirmed" | "tentative" | "cancelled"
}

export interface CalendarListEntryDto {
  id: string
  summary: string
  backgroundColor?: string
  selected?: boolean
  accessRole: string
}
