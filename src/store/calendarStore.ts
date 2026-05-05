import { create } from 'zustand'
import { db } from '@/services/db'
import type { CalendarEvent, CalendarItem } from '@/types/calendarEvent'

interface CalendarState {
  /** All calendar events currently in memory (durable cache is Dexie). */
  events: CalendarEvent[]
  /** Calendar list — ephemeral, re-fetched on each sync. */
  calendars: CalendarItem[]
  isLoading: boolean

  /**
   * Bulk-replace the in-memory event list AND clear+repopulate Dexie.
   * Called after a full sync to ensure Dexie is consistent with the fetched window.
   */
  setEvents: (events: CalendarEvent[]) => Promise<void>

  /** Insert/update a single event in memory + Dexie (used after create/update). */
  upsertEvent: (event: CalendarEvent) => Promise<void>

  /** Remove a single event from memory + Dexie (used after delete). */
  removeEvent: (id: string) => Promise<void>

  /** Replace the in-memory calendar list (ephemeral — not persisted to Dexie). */
  setCalendars: (calendars: CalendarItem[]) => void

  /** Load events from Dexie into memory (called on app start / offline fallback). */
  loadFromDb: () => Promise<void>

  setLoading: (loading: boolean) => void
}

export const useCalendarStore = create<CalendarState>((set) => ({
  events: [],
  calendars: [],
  isLoading: false,

  setEvents: async (events) => {
    // Clear Dexie first so stale events outside the time window are removed
    await db.calendarEvents.clear()
    await db.calendarEvents.bulkPut(events)
    set({ events })
  },

  upsertEvent: async (event) => {
    await db.calendarEvents.put(event)
    set((s) => {
      const filtered = s.events.filter(e => e.id !== event.id)
      return { events: [...filtered, event] }
    })
  },

  removeEvent: async (id) => {
    await db.calendarEvents.delete(id)
    set((s) => ({ events: s.events.filter(e => e.id !== id) }))
  },

  setCalendars: (calendars) => {
    set({ calendars })
  },

  loadFromDb: async () => {
    const events = await db.calendarEvents.toArray()
    set({ events })
  },

  setLoading: (loading) => {
    set({ isLoading: loading })
  },
}))
