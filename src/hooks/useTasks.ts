import { useMemo } from 'react'
import { useTasksStore } from '@/store/tasksStore'
import { useUIStore } from '@/store/uiStore'
import { useCalendarStore } from '@/store/calendarStore'
import { parseISO, isBefore, startOfDay, isTomorrow, format } from 'date-fns'
import { formatDayGroupLabel } from '@/utils/dateUtils'
import { INBOX_FOLDER_ID } from '@/utils/constants'
import type { CalendarEvent } from '@/types/calendarEvent'
import type { Task } from '@/types/task'

export type TaskGroup = {
  key: string      // 'overdue' | 'YYYY-MM-DD'
  label: string
  isOverdue: boolean
  isToday: boolean
  isTomorrow: boolean
  tasks: Task[]
}

// ── Merged task + event types (F-01) ──────────────────────────────────────────

export type MergedItem =
  | { type: 'task'; task: Task }
  | { type: 'event'; event: CalendarEvent }

export type MergedGroup = {
  key: string
  label: string
  isOverdue: boolean
  isToday: boolean
  isTomorrow: boolean
  items: MergedItem[]
}

// ── Upcoming view: pending ROOT tasks with a deadline, grouped by day ─────────
export function useUpcomingGroups(): TaskGroup[] {
  const tasks = useTasksStore((s) => s.tasks)

  return useMemo(() => {
    // All pending tasks with a deadline, regardless of hierarchy level
    const pending = tasks.filter(t => t.status === 'pending' && t.deadline_date)
    const sorted = [...pending].sort((a, b) => a.deadline_date.localeCompare(b.deadline_date))

    const today = startOfDay(new Date())
    const groups = new Map<string, TaskGroup>()

    for (const task of sorted) {
      const date = parseISO(task.deadline_date)
      const isOver = isBefore(date, today)
      const key = isOver ? 'overdue' : task.deadline_date

      if (!groups.has(key)) {
        const isToday = !isOver && task.deadline_date === today.toISOString().slice(0, 10)
        groups.set(key, {
          key,
          label: isOver ? 'Overdue' : formatDayGroupLabel(task.deadline_date),
          isOverdue: isOver,
          isToday,
          isTomorrow: !isOver && isTomorrow(date),
          tasks: [],
        })
      }
      groups.get(key)!.tasks.push(task)
    }

    // Sort groups: overdue first, then chronological
    const result = Array.from(groups.values())
    result.sort((a, b) => {
      if (a.isOverdue) return -1
      if (b.isOverdue) return 1
      return a.key.localeCompare(b.key)
    })
    // Within each group: sort by time (tasks without time go last)
    for (const group of result) {
      group.tasks.sort((a, b) =>
        (a.deadline_time || '99:99').localeCompare(b.deadline_time || '99:99'),
      )
    }
    return result
  }, [tasks])
}

export const PRIORITY_ORDER: Record<string, number> = { urgent: 0, important: 1, normal: 2 }

// ── Folder view: pending root tasks ───────────────────────────────────────────
export function useFilteredRootTasks() {
  const tasks = useTasksStore((s) => s.tasks)
  const { selectedFolderId } = useUIStore()

  return useMemo(() => {
    const roots = tasks.filter(t => t.status === 'pending' && t.parent_id === '')
    return roots
      .filter(t => {
        if (selectedFolderId === INBOX_FOLDER_ID) {
          return t.folder_id === INBOX_FOLDER_ID || t.folder_id === ''
        }
        return t.folder_id === selectedFolderId
      })
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [tasks, selectedFolderId])
}

// ── All tasks view: all pending tasks, flat ───────────────────────────────────
export function useAllTasks() {
  const tasks = useTasksStore((s) => s.tasks)

  return useMemo(() => {
    return tasks
      .filter(t => t.status === 'pending')
      .sort((a, b) => {
        // 1. Priority (urgent → important → normal)
        const pa = PRIORITY_ORDER[a.priority] ?? 2
        const pb = PRIORITY_ORDER[b.priority] ?? 2
        if (pa !== pb) return pa - pb
        // 2. Deadline (earliest first, then by time, no deadline last)
        if (a.deadline_date && b.deadline_date) {
          const dc = a.deadline_date.localeCompare(b.deadline_date)
          if (dc !== 0) return dc
          return (a.deadline_time || '99:99').localeCompare(b.deadline_time || '99:99')
        }
        if (a.deadline_date) return -1
        if (b.deadline_date) return 1
        // 3. Created at (oldest first)
        return a.created_at.localeCompare(b.created_at)
      })
  }, [tasks])
}


// ── F-01: Upcoming + events, merged by day ────────────────────────────────────
export function useUpcomingGroupsWithEvents(): MergedGroup[] {
  const tasks = useTasksStore(s => s.tasks)
  const events = useCalendarStore(s => s.events)

  return useMemo(() => {
    const today = startOfDay(new Date())
    const todayStr = format(today, 'yyyy-MM-dd')
    const groups = new Map<string, MergedGroup>()

    const ensureGroup = (key: string, dateStr: string, isOver: boolean, date: Date) => {
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: isOver ? 'Overdue' : formatDayGroupLabel(dateStr),
          isOverdue: isOver,
          isToday: !isOver && dateStr === todayStr,
          isTomorrow: !isOver && isTomorrow(date),
          items: [],
        })
      }
      return groups.get(key)!
    }

    // Pending tasks with a deadline
    for (const task of tasks) {
      if (task.status !== 'pending' || !task.deadline_date) continue
      const date = parseISO(task.deadline_date)
      const isOver = isBefore(date, today)
      const key = isOver ? 'overdue' : task.deadline_date
      ensureGroup(key, task.deadline_date, isOver, date).items.push({ type: 'task', task })
    }

    // Calendar events
    for (const event of events) {
      const date = parseISO(event.startDate)
      const isOver = isBefore(date, today)
      const key = isOver ? 'overdue' : event.startDate
      ensureGroup(key, event.startDate, isOver, date).items.push({ type: 'event', event })
    }

    // Sort groups: overdue first, then chronological
    const result = Array.from(groups.values())
    result.sort((a, b) => {
      if (a.isOverdue) return -1
      if (b.isOverdue) return 1
      return a.key.localeCompare(b.key)
    })

    // Sort within each group: timed items ascending, then all-day items
    for (const group of result) {
      group.items.sort((a, b) => {
        const aTime = a.type === 'task'
          ? a.task.deadline_time
          : (a.event.isAllDay ? '' : a.event.startTime)
        const bTime = b.type === 'task'
          ? b.task.deadline_time
          : (b.event.isAllDay ? '' : b.event.startTime)
        return (aTime || '99:99').localeCompare(bTime || '99:99')
      })
    }

    return result
  }, [tasks, events])
}

// ── F-01: Events for a specific calendar, sorted by date+time ─────────────────
export function useCalendarEvents(calendarId: string): CalendarEvent[] {
  const events = useCalendarStore(s => s.events)
  return useMemo(() => {
    return events
      .filter(e => e.calendarId === calendarId)
      .sort((a, b) => {
        const dc = a.startDate.localeCompare(b.startDate)
        if (dc !== 0) return dc
        return (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
      })
  }, [events, calendarId])
}

// ── Completed view: all completed tasks sorted by completion time desc ─────────
export function useCompletedTasks() {
  const tasks = useTasksStore((s) => s.tasks)
  return useMemo(() => {
    return tasks
      .filter(t => t.status === 'completed')
      .sort((a, b) => (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at))
  }, [tasks])
}
