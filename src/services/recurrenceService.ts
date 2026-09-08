import { addDays, addWeeks, addMonths, addYears, format, parseISO } from 'date-fns'
import type { Task } from '@/types/task'

export function getNextDueDate(task: Task): string | null {
  if (!task.is_recurring || !task.deadline_date) return null
  const base = parseISO(task.deadline_date)
  let next: Date
  switch (task.recur_type) {
    case 'days':   next = addDays(base, task.recur_value); break
    case 'weeks':  next = addWeeks(base, task.recur_value); break
    case 'months': next = addMonths(base, task.recur_value); break
    case 'years':  next = addYears(base, task.recur_value); break
    default: return null
  }
  return format(next, 'yyyy-MM-dd')
}

