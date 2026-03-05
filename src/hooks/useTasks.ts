import { useMemo } from 'react'
import { useTasksStore } from '@/store/tasksStore'
import { useUIStore } from '@/store/uiStore'
import { parseISO, isBefore, startOfDay } from 'date-fns'
import { formatDayGroupLabel } from '@/utils/dateUtils'
import { INBOX_FOLDER_ID } from '@/utils/constants'

export type TaskGroup = {
  key: string      // 'overdue' | 'YYYY-MM-DD'
  label: string
  isOverdue: boolean
  isToday: boolean
  isTomorrow: boolean
  tasks: import('@/types/task').Task[]
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
          isTomorrow: false,
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
        // 2. Deadline (earliest first, no deadline last)
        if (a.deadline_date && b.deadline_date) return a.deadline_date.localeCompare(b.deadline_date)
        if (a.deadline_date) return -1
        if (b.deadline_date) return 1
        // 3. Created at (oldest first)
        return a.created_at.localeCompare(b.created_at)
      })
  }, [tasks])
}

// ── Label view: pending tasks filtered by label, sorted by priority → deadline ─
export function useLabelTasks() {
  const tasks = useTasksStore((s) => s.tasks)
  const { selectedLabelId } = useUIStore()

  return useMemo(() => {
    if (!selectedLabelId) return []
    return tasks
      .filter(t => t.status === 'pending' && t.labels.split(',').filter(Boolean).includes(selectedLabelId))
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 2
        const pb = PRIORITY_ORDER[b.priority] ?? 2
        if (pa !== pb) return pa - pb
        if (a.deadline_date && b.deadline_date) return a.deadline_date.localeCompare(b.deadline_date)
        if (a.deadline_date) return -1
        if (b.deadline_date) return 1
        return a.created_at.localeCompare(b.created_at)
      })
  }, [tasks, selectedLabelId])
}

// ── Priority view: pending tasks filtered by priority, sorted by deadline ─────
export function usePriorityTasks() {
  const tasks = useTasksStore((s) => s.tasks)
  const { selectedPriority } = useUIStore()

  return useMemo(() => {
    if (!selectedPriority) return []
    return tasks
      .filter(t => t.status === 'pending' && t.priority === selectedPriority)
      .sort((a, b) => {
        if (a.deadline_date && b.deadline_date) return a.deadline_date.localeCompare(b.deadline_date)
        if (a.deadline_date) return -1
        if (b.deadline_date) return 1
        return a.created_at.localeCompare(b.created_at)
      })
  }, [tasks, selectedPriority])
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
