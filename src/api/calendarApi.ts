import { useAuthStore } from '@/store/authStore'
import type {
  CalendarEvent,
  CalendarItem,
  CalendarEventDto,
  CalendarListEntryDto,
  EventDateTime,
} from '@/types/calendarEvent'

const BASE = 'https://www.googleapis.com/calendar/v3'

// ── HTTP helper ──────────────────────────────────────────────────────────────

async function calendarRequest<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const { accessToken, refreshToken } = useAuthStore.getState()

  const makeReq = async (token: string) =>
    fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

  let res = await makeReq(accessToken ?? '')

  if (res.status === 401) {
    await refreshToken()
    res = await makeReq(useAuthStore.getState().accessToken ?? '')
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Calendar API ${res.status}: ${errText}`)
  }
  if (res.status === 204) return undefined as T   // DELETE returns no content
  return res.json() as Promise<T>
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

function parseDateTime(dt: EventDateTime): { date: string; time: string; isAllDay: boolean } {
  if (dt.date) {
    return { date: dt.date, time: '', isAllDay: true }
  }
  const iso = dt.dateTime ?? ''
  // ISO 8601 offset datetime — extract date (YYYY-MM-DD) and time (HH:MM)
  const date = iso.slice(0, 10)
  const time = iso.slice(11, 16)
  return { date, time, isAllDay: false }
}

function dtoToCalendarEvent(
  dto: CalendarEventDto,
  calendarId: string,
  calendarName: string,
  calendarColor: string,
): CalendarEvent {
  const { date: startDate, time: startTime, isAllDay } = parseDateTime(dto.start)
  const endTime = dto.end?.dateTime ? dto.end.dateTime.slice(11, 16) : ''

  return {
    id: dto.id,
    calendarId,
    calendarName,
    calendarColor,
    title: dto.summary ?? '(No title)',
    startDate,
    startTime,
    endTime,
    isAllDay,
    recurringEventId: dto.recurringEventId ?? null,
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Returns all calendars from the user's calendar list. */
export async function listCalendars(): Promise<CalendarItem[]> {
  const data = await calendarRequest<{ items?: CalendarListEntryDto[] }>(
    'GET',
    `${BASE}/users/me/calendarList`,
  )
  return (data.items ?? []).map(item => ({
    id: item.id,
    summary: item.summary,
    color: item.backgroundColor ?? '#039be5',
    isSelected: item.selected ?? false,
    accessRole: item.accessRole,
  }))
}

/**
 * Returns all event instances in [timeMin, timeMax) for a given calendar.
 * Handles nextPageToken pagination automatically.
 * Denormalises calendarName + calendarColor from the provided values.
 */
export async function listEvents(
  calendarId: string,
  calendarName: string,
  calendarColor: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const collected: CalendarEventDto[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin,
      timeMax,
      maxResults: '250',
      ...(pageToken ? { pageToken } : {}),
    })
    const data = await calendarRequest<{
      items?: CalendarEventDto[]
      nextPageToken?: string
    }>('GET', `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`)

    collected.push(...(data.items ?? []).filter(e => e.status !== 'cancelled'))
    pageToken = data.nextPageToken
  } while (pageToken)

  return collected.map(dto =>
    dtoToCalendarEvent(dto, calendarId, calendarName, calendarColor),
  )
}

/** Fetches a single event (used to get the base event of a recurring series). */
export async function getEvent(
  calendarId: string,
  eventId: string,
): Promise<CalendarEventDto> {
  return calendarRequest<CalendarEventDto>(
    'GET',
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  )
}

/** Creates a new event and returns the server-assigned DTO. */
export async function createEvent(
  calendarId: string,
  body: Record<string, unknown>,
): Promise<CalendarEventDto> {
  return calendarRequest<CalendarEventDto>(
    'POST',
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    body,
  )
}

/** Updates an existing event (full replace via PUT). */
export async function updateEvent(
  calendarId: string,
  eventId: string,
  body: Record<string, unknown>,
): Promise<CalendarEventDto> {
  return calendarRequest<CalendarEventDto>(
    'PUT',
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    body,
  )
}

/** Deletes an event. Returns void (HTTP 204). */
export async function deleteEvent(
  calendarId: string,
  eventId: string,
): Promise<void> {
  return calendarRequest<void>(
    'DELETE',
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  )
}
