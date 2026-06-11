import { Flag, Tag, Folder, CalendarDays } from 'lucide-react'
import { useUIStore, type TaskFilters } from '@/store/uiStore'
import { useLabelsStore } from '@/store/labelsStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useCalendarStore } from '@/store/calendarStore'
import { usePrefsStore } from '@/store/prefsStore'
import { cn } from '@/lib/utils'
import { PRIORITY_OPTS } from './priorityOpts'

interface Props {
  open: boolean
  onClose: () => void
}

/** Bottom-sheet filter panel (same pattern as Money): backdrop + slide-up
 *  sheet, "Clear all filters" pinned at the top, section titles above the
 *  chips. Filters apply instantly — no Apply button (family convention). */
export function TaskFilterPanel({ open, onClose }: Props) {
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
      <section>
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
        <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
          {items.map(item => {
            const on = active.includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleFilter(kind, item.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors whitespace-nowrap',
                  on
                    ? 'bg-primary/15 text-primary border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={12} style={{ color: item.color }} />
                <span className="max-w-[140px] truncate">{item.name}</span>
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      )}

      {/* Bottom sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl border-t transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '80dvh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted" />
        </div>

        {/* Clear — always visible at top so user never has to scroll */}
        {anyActive && (
          <div className="shrink-0 px-4 pb-1">
            <button
              onClick={() => { clearFilters(); onClose() }}
              className="text-sm text-destructive hover:text-destructive/80 font-medium"
            >
              Clear all filters
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pb-6 flex flex-col gap-5">
          {prioritiesEnabled && section('Priority', 'priorities',
            PRIORITY_OPTS.map(p => ({ id: p.id, name: p.title, color: p.color })), Flag)}
          {labelsEnabled && section('Labels', 'labels',
            labels.map(l => ({ id: l.id, name: l.name, color: l.color })), Tag)}
          {foldersEnabled && section('Folders', 'folders',
            folders.map(f => ({ id: f.id, name: f.name, color: f.color || '#9ca3af' })), Folder)}
          {section('Calendars', 'calendars',
            enabledCalendars.map(c => ({ id: c.id, name: c.summary, color: c.color || '#9ca3af' })), CalendarDays)}
        </div>
      </div>
    </>
  )
}
