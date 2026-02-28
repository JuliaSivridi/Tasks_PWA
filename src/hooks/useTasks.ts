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

// ── Folder / label view: pending root tasks ───────────────────────────────────
export function useFilteredRootTasks() {
  const tasks = useTasksStore((s) => s.tasks)
  const { selectedView, selectedFolderId, selectedLabelId } = useUIStore()

  return useMemo(() => {
    const pending = tasks.filter(t => t.status === 'pending')
    const roots = pending.filter(t => t.parent_id === '')

    if (selectedView === 'folder') {
      return roots
        .filter(t => {
          if (selectedFolderId === INBOX_FOLDER_ID) {
            return t.folder_id === INBOX_FOLDER_ID || t.folder_id === ''
          }
          return t.folder_id === selectedFolderId
        })
        .sort((a, b) => a.sort_order - b.sort_order)
    }

    if (selectedView === 'label') {
      return pending
        .filter(t => selectedLabelId && t.labels.split(',').map(l => l.trim()).includes(selectedLabelId))
        .sort((a, b) => {
          // Deadline first (earliest), then by created_at for undated tasks
          if (a.deadline_date && b.deadline_date) return a.deadline_date.localeCompare(b.deadline_date)
          if (a.deadline_date) return -1
          if (b.deadline_date) return 1
          return a.created_at.localeCompare(b.created_at)
        })
    }

    return roots.sort((a, b) => a.sort_order - b.sort_order)
  }, [tasks, selectedView, selectedFolderId, selectedLabelId])
}

// ── Priority view: pending root tasks filtered by priority ────────────────────
export function usePriorityRootTasks() {
  const tasks = useTasksStore((s) => s.tasks)
  const { selectedPriorityId } = useUIStore()

  return useMemo(() => {
    return tasks
      .filter(t => t.status === 'pending' && t.parent_id === '' && t.priority === selectedPriorityId)
      .sort((a, b) => {
        // Deadline first (earliest), then by sort_order for undated tasks
        if (a.deadline_date && b.deadline_date) return a.deadline_date.localeCompare(b.deadline_date)
        if (a.deadline_date) return -1
        if (b.deadline_date) return 1
        return a.sort_order - b.sort_order
      })
  }, [tasks, selectedPriorityId])
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
