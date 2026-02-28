import { format, isToday, isTomorrow, isBefore, startOfDay, parseISO, differenceInCalendarDays } from 'date-fns'

export function now(): string {
  return new Date().toISOString()
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function isOverdue(deadlineDate: string): boolean {
  if (!deadlineDate) return false
  return isBefore(parseISO(deadlineDate), startOfDay(new Date()))
}

export function isDueToday(deadlineDate: string): boolean {
  if (!deadlineDate) return false
  return isToday(parseISO(deadlineDate))
}

export function isDueTomorrow(deadlineDate: string): boolean {
  if (!deadlineDate) return false
  return isTomorrow(parseISO(deadlineDate))
}

export type DeadlineStatus = 'overdue' | 'today' | 'tomorrow' | 'week' | 'future'

export function getDeadlineStatus(deadlineDate: string, deadlineTime?: string): DeadlineStatus {
  if (!deadlineDate) return 'future'
  const date = parseISO(deadlineDate)
  const today = startOfDay(new Date())
  if (isBefore(date, today)) return 'overdue'
  if (isToday(date)) {
    if (deadlineTime) {
      const [h, m] = deadlineTime.split(':').map(Number)
      const deadline = new Date()
      deadline.setHours(h, m, 0, 0)
      if (isBefore(deadline, new Date())) return 'overdue'
    }
    return 'today'
  }
  if (isTomorrow(date)) return 'tomorrow'
  const diff = differenceInCalendarDays(date, today)
  if (diff <= 7) return 'week'
  return 'future'
}

export function formatDeadline(deadlineDate: string, deadlineTime: string): string {
  if (!deadlineDate) return ''
  const date = parseISO(deadlineDate)
  let label = ''
  if (isToday(date)) {
    label = 'Today'
  } else if (isTomorrow(date)) {
    label = 'Tomorrow'
  } else {
    label = format(date, 'MMM d')
  }
  if (deadlineTime) {
    label += ` ${deadlineTime}`
  }
  return label
}

export function formatDayGroupLabel(dateStr: string): string {
  const date = parseISO(dateStr)
  if (isToday(date)) {
    return `${format(date, 'MMM d')} · Today · ${format(date, 'EEEE')}`
  }
  if (isTomorrow(date)) {
    return `${format(date, 'MMM d')} · Tomorrow · ${format(date, 'EEEE')}`
  }
  return `${format(date, 'MMM d')} · ${format(date, 'EEEE')}`
}

export function formatCompletedAt(completedAt: string): string {
  if (!completedAt) return ''
  return format(new Date(completedAt), 'MMM d, yyyy HH:mm')
}

/** For task second-line: "d MMM" (current year) or "d MMM yyyy" (other year). Appends time if provided. */
export function formatTaskDeadlineLabel(deadlineDate: string, deadlineTime?: string): string {
  if (!deadlineDate) return ''
  const date = parseISO(deadlineDate)
  const datePart = format(date, date.getFullYear() === new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy')
  return deadlineTime ? `${datePart} ${deadlineTime}` : datePart
}
