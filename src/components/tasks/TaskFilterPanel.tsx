import { Flag, Tag, Folder, CalendarDays, X } from 'lucide-react'
import { useUIStore, type TaskFilters } from '@/store/uiStore'
import { useLabelsStore } from '@/store/labelsStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useCalendarStore } from '@/store/calendarStore'
import { usePrefsStore } from '@/store/prefsStore'
import { cn } from '@/lib/utils'
import { PRIORITY_OPTS } from './priorityOpts'

/** Money-style filter panel under the header: sections of colored chips,
 *  filters apply instantly (no Apply button — family convention). */
export function TaskFilterPanel() {
  const { taskFilters, toggleFilter, clearFilters } = useUIStore()
  const { labels } = useLabelsStore()
  const { folders } = useFoldersStore()
  const { calendars } = useCalendarStore()
  const { enabledCalendarIds, prioritiesEnabled, labelsEnabled, foldersEnabled, calendarEnabled } = usePrefsStore()

  const enabledCalendars = calendarEnabled ? calendars.filter(c => enabledCalendarIds.includes(c.id)) : []

  const anyActive =
    taskFilters.priorities.length > 0 || taskFilters.labels.length > 0 ||
    taskFilters.folders.length > 0 || taskFilters.calendars.length > 0

  const section = (
    title: string,
    kind: keyof TaskFilters,
    items: { id: string; name: string; color: string }[],
    Icon: typeof Flag,
  ) => {
    if (items.length === 0) return null
    const active = taskFilters[kind]
    return (
      <div className="flex items-start gap-3">
        <span className="w-20 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
          {title}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {items.map(item => {
            const on = active.includes(item.id)
            return (
              <button
                key={item.id}
                onClick={() => toggleFilter(kind, item.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-sm transition-colors',
                  on ? 'border-transparent text-white' : 'border-border text-foreground/80 hover:border-foreground/40',
                )}
                style={on
                  ? { backgroundColor: item.color }
                  : undefined}
              >
                <Icon size={12} style={on ? undefined : { color: item.color }} />
                <span className="max-w-[140px] truncate">{item.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 border-b bg-background space-y-2.5">
      {prioritiesEnabled && section('Priority', 'priorities',
        PRIORITY_OPTS.map(p => ({ id: p.id, name: p.title, color: p.color })), Flag)}
      {labelsEnabled && section('Labels', 'labels',
        labels.map(l => ({ id: l.id, name: l.name, color: l.color })), Tag)}
      {foldersEnabled && section('Folders', 'folders',
        folders.map(f => ({ id: f.id, name: f.name, color: f.color || '#9ca3af' })), Folder)}
      {section('Calendars', 'calendars',
        enabledCalendars.map(c => ({ id: c.id, name: c.summary, color: c.color || '#9ca3af' })), CalendarDays)}

      {anyActive && (
        <div className="flex justify-end">
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={13} /> Clear all
          </button>
        </div>
      )}
    </div>
  )
}
