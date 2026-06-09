import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, FolderOpen, Trash2, RotateCcw, Flag, Tag, ChevronLeft, ChevronRight, Calendar, Folder, CalendarDays, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { format, startOfWeek, addDays, parseISO, isBefore, startOfDay } from 'date-fns'
import { TaskItem } from './TaskItem'
import { TaskCreateModal } from './TaskCreateModal'
import { CalendarEventItem } from '@/components/calendar/CalendarEventItem'
import {
  useUpcomingGroupsWithEvents, useCalendarEvents, useFilteredRootTasks,
  useCompletedTasks, useAllTasks,
  type MergedItem,
} from '@/hooks/useTasks'
import { useUIStore } from '@/store/uiStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useLabelsStore } from '@/store/labelsStore'
import { useTasksStore } from '@/store/tasksStore'
import { useCalendarStore } from '@/store/calendarStore'
import { usePrefsStore } from '@/store/prefsStore'
import { deleteEvent } from '@/api/calendarApi'
import { pullCalendar, scheduleFlush } from '@/services/syncService'
import { formatCompletedAt, formatDayGroupLabel } from '@/utils/dateUtils'
import { cn } from '@/lib/utils'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/types/calendarEvent'

// ── Sortable task wrapper for DnD ─────────────────────────────────────────────

function SortableTaskRow({ task, showFolder }: { task: Task; showFolder: boolean }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex items-stretch"
    >
      <button
        {...attributes}
        {...listeners}
        className="flex items-center px-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        tabIndex={-1}
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1">
        <TaskItem task={task} depth={0} showFolder={showFolder} />
      </div>
    </div>
  )
}

// ── Priority options (shared) ─────────────────────────────────────────────────

const PRIORITY_OPTS = [
  { id: 'urgent',    color: '#f87171', title: 'Urgent' },
  { id: 'important', color: '#fb923c', title: 'Important' },
  { id: 'normal',    color: '#9ca3af', title: 'Normal' },
] as const

// ── Filter bar: priority / label / folder / calendar dropdown multi-select ────

interface FilterBarProps {
  priorityFilter: string[]
  setPriorityFilter: (v: string[]) => void
  labelFilter: string[]
  setLabelFilter: (v: string[]) => void
  folderFilter: string[]
  setFolderFilter: (v: string[]) => void
  calendarFilter: string[]
  setCalendarFilter: (v: string[]) => void
  onClearAll: () => void
}

function FilterBar({
  priorityFilter, setPriorityFilter,
  labelFilter, setLabelFilter,
  folderFilter, setFolderFilter,
  calendarFilter, setCalendarFilter,
  onClearAll,
}: FilterBarProps) {
  const { labels } = useLabelsStore()
  const { folders } = useFoldersStore()
  const { calendars } = useCalendarStore()
  const { enabledCalendarIds, prioritiesEnabled, labelsEnabled, foldersEnabled } = usePrefsStore()
  const enabledCalendars = calendars.filter(c => enabledCalendarIds.includes(c.id))

  const toggle = <T extends string>(arr: T[], id: T, set: (v: T[]) => void) =>
    set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])

  const anyActive =
    (prioritiesEnabled && priorityFilter.length > 0) ||
    (labelsEnabled && labelFilter.length > 0) ||
    (foldersEnabled && folderFilter.length > 0) ||
    calendarFilter.length > 0

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b">
      {/* Clear all filters button — shown when any filter is active */}
      {anyActive && (
        <button
          onClick={onClearAll}
          className="p-1.5 rounded transition-colors hover:bg-accent text-muted-foreground hover:text-foreground"
          title="Clear all filters"
        >
          <X size={14} />
        </button>
      )}

      {/* Priority */}
      {prioritiesEnabled && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn('p-1.5 rounded transition-colors hover:bg-accent', priorityFilter.length > 0 && 'bg-accent')}>
              <Flag size={14} className={priorityFilter.length > 0 ? 'text-foreground' : 'text-muted-foreground'} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[140px]">
            {PRIORITY_OPTS.map(p => (
              <DropdownMenuItem key={p.id} onSelect={(e) => { e.preventDefault(); toggle(priorityFilter, p.id, setPriorityFilter) }}>
                <Flag size={14} className="mr-2" style={{ color: p.color }} />
                {p.title}
                {priorityFilter.includes(p.id) && <span className="ml-auto pl-2 text-primary">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Label */}
      {labelsEnabled && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn('p-1.5 rounded transition-colors hover:bg-accent', labelFilter.length > 0 && 'bg-accent')}
              disabled={labels.length === 0}
            >
              <Tag size={14} className={labelFilter.length > 0 ? 'text-foreground' : 'text-muted-foreground'} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[140px]">
            {labels.map(l => (
              <DropdownMenuItem key={l.id} onSelect={(e) => { e.preventDefault(); toggle(labelFilter, l.id, setLabelFilter) }}>
                <Tag size={14} className="mr-2" style={{ color: l.color }} />
                <span style={{ color: l.color }}>{l.name}</span>
                {labelFilter.includes(l.id) && <span className="ml-auto pl-2 text-primary">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Folder */}
      {foldersEnabled && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn('p-1.5 rounded transition-colors hover:bg-accent', folderFilter.length > 0 && 'bg-accent')}
              disabled={folders.length === 0}
            >
              <Folder size={14} className={folderFilter.length > 0 ? 'text-foreground' : 'text-muted-foreground'} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[140px]">
            {folders.map(f => (
              <DropdownMenuItem key={f.id} onSelect={(e) => { e.preventDefault(); toggle(folderFilter, f.id, setFolderFilter) }}>
                <Folder size={14} className="mr-2" style={{ color: f.color }} />
                {f.name}
                {folderFilter.includes(f.id) && <span className="ml-auto pl-2 text-primary">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Calendar chip — only enabled calendars */}
      {enabledCalendars.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn('p-1.5 rounded transition-colors hover:bg-accent', calendarFilter.length > 0 && 'bg-accent')}>
              <CalendarDays size={14} className={calendarFilter.length > 0 ? 'text-foreground' : 'text-muted-foreground'} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            {enabledCalendars.map(cal => (
              <DropdownMenuItem
                key={cal.id}
                onSelect={(e) => { e.preventDefault(); toggle(calendarFilter, cal.id, setCalendarFilter) }}
              >
                <CalendarDays size={14} className="mr-2 flex-shrink-0" style={{ color: cal.color }} />
                <span className="flex-1 truncate">{cal.summary}</span>
                {calendarFilter.includes(cal.id) && <span className="ml-auto pl-2 text-primary">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function applyTaskFilters(tasks: Task[], priorityFilter: string[], labelFilter: string[], folderFilter: string[]) {
  return tasks.filter(t => {
    if (priorityFilter.length > 0 && !priorityFilter.includes(t.priority)) return false
    if (labelFilter.length > 0 && !labelFilter.some(id => t.labels.split(',').filter(Boolean).includes(id))) return false
    if (folderFilter.length > 0 && !folderFilter.includes(t.folder_id)) return false
    return true
  })
}

// Keep backward-compat alias for views that don't use calendar filter
const applyFilters = applyTaskFilters

function applyCalendarFilterFn(events: CalendarEvent[], calendarFilter: string[]) {
  if (calendarFilter.length === 0) return events
  return events.filter(e => calendarFilter.includes(e.calendarId))
}

/** F-02 filter matrix — returns what to show.
 *
 *  Combined mode: task filters and calendar filter can be active simultaneously.
 *  - Only cal active  → show calendar events only
 *  - Only task active → show tasks only
 *  - Both active      → show both (filtered events + filtered tasks)
 *  - Neither          → show everything
 */
function filterMatrix(
  priorityFilter: string[], labelFilter: string[], folderFilter: string[],
  calendarFilter: string[],
): { showTasks: boolean; showEvents: boolean; calActive: boolean; taskActive: boolean } {
  const taskActive = priorityFilter.length > 0 || labelFilter.length > 0 || folderFilter.length > 0
  const calActive = calendarFilter.length > 0
  return {
    taskActive,
    calActive,
    showTasks: taskActive || !calActive,
    showEvents: calActive || !taskActive,
  }
}

// ── Event action helpers (shared by Upcoming + AllTasks) ──────────────────────

function useEventHandlers() {
  const { removeEvent } = useCalendarStore()

  const handleDelete = useCallback(async (event: CalendarEvent) => {
    try {
      await deleteEvent(event.calendarId, event.id)
      await removeEvent(event.id)
    } catch (err) {
      console.error('Delete event error', err)
    }
  }, [removeEvent])

  const handleDeleteSeries = useCallback(async (event: CalendarEvent) => {
    if (!event.recurringEventId) return
    try {
      await deleteEvent(event.calendarId, event.recurringEventId)
      void pullCalendar()   // re-pull to remove all instances
    } catch (err) {
      console.error('Delete series error', err)
    }
  }, [])

  return { handleDelete, handleDeleteSeries }
}

// ── Week navigation strip ─────────────────────────────────────────────────────

function WeekStrip({
  weekOffset, activeDate, datesWithContent,
  onDayClick, onPrev, onNext, onToday,
}: {
  weekOffset: number
  activeDate: string | null
  datesWithContent: Set<string>
  onDayClick: (dateStr: string) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const weekDays = useMemo(() => {
    const startOfCurrentWeek = startOfWeek(new Date(), { weekStartsOn: 1 })
    const startDate = addDays(startOfCurrentWeek, weekOffset * 7)
    return Array.from({ length: 7 }, (_, i) => addDays(startDate, i))
  }, [weekOffset])

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-background">
      <button onClick={onPrev} className="p-1 rounded hover:bg-accent text-foreground/60 hover:text-foreground transition-colors flex-shrink-0">
        <ChevronLeft size={14} />
      </button>

      <div className="flex flex-1 gap-0.5">
        {weekDays.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const isToday = dateStr === todayStr
          const isActive = activeDate === dateStr
          const hasDot = datesWithContent.has(dateStr)
          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={cn('flex-1 flex flex-col items-center py-1 rounded transition-colors', isActive ? 'bg-accent' : 'hover:bg-accent/50')}
            >
              <span className={cn('text-xs font-medium leading-tight', isToday ? 'text-green-600' : isActive ? 'text-foreground' : 'text-foreground/70')}>
                {format(day, 'd')}
              </span>
              <span className={cn('text-xs leading-tight', isToday ? 'text-green-600' : isActive ? 'text-foreground/70' : 'text-foreground/50')}>
                {format(day, 'EEEEE')}
              </span>
              <span className={cn('w-1 h-1 rounded-full mt-0.5', hasDot ? (isToday ? 'bg-green-600' : 'bg-primary') : 'bg-transparent')} />
            </button>
          )
        })}
      </div>

      <button
        onClick={onToday}
        className={cn('p-1 rounded border flex-shrink-0 transition-colors', weekOffset === 0 ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:bg-accent')}
        title="Go to today"
      >
        <Calendar size={14} />
      </button>

      <button onClick={onNext} className="p-1 rounded hover:bg-accent text-foreground/60 hover:text-foreground transition-colors flex-shrink-0">
        <ChevronRight size={14} />
      </button>
    </div>
  )
}

// ── Upcoming view — F-03: merged tasks + events ───────────────────────────────

function UpcomingView({ onEditCalendarEvent }: { onEditCalendarEvent: (e: CalendarEvent) => void }) {
  const groups = useUpcomingGroupsWithEvents()
  const { setCreateTaskOpen } = useUIStore()
  const { handleDelete, handleDeleteSeries } = useEventHandlers()
  const calendars = useCalendarStore(s => s.calendars)

  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [labelFilter, setLabelFilter] = useState<string[]>([])
  const [folderFilter, setFolderFilter] = useState<string[]>([])
  const [calendarFilter, setCalendarFilter] = useState<string[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [activeDate, setActiveDate] = useState<string | null>(() => format(new Date(), 'yyyy-MM-dd'))
  const scrollRef = useRef<HTMLDivElement>(null)

  const { showTasks, showEvents, calActive } = filterMatrix(priorityFilter, labelFilter, folderFilter, calendarFilter)

  // Apply filter matrix to each group
  const filtered = useMemo(() => groups.map(g => {
    const taskItems = g.items.filter(i => i.type === 'task')
    const eventItems = g.items.filter(i => i.type === 'event')

    const visibleTasks: MergedItem[] = showTasks
      ? applyTaskFilters(taskItems.map(i => (i as { type: 'task'; task: Task }).task), priorityFilter, labelFilter, folderFilter)
          .map(t => ({ type: 'task' as const, task: t }))
      : []

    const visibleEvents: MergedItem[] = showEvents
      ? applyCalendarFilterFn(
          eventItems.map(i => (i as { type: 'event'; event: CalendarEvent }).event),
          calActive ? calendarFilter : [],
        ).map(e => ({ type: 'event' as const, event: e }))
      : []

    // Re-sort within the group (timed first, then all-day)
    const items: MergedItem[] = [...visibleTasks, ...visibleEvents].sort((a, b) => {
      const aTime = a.type === 'task' ? a.task.deadline_time : (a.event.isAllDay ? '' : a.event.startTime)
      const bTime = b.type === 'task' ? b.task.deadline_time : (b.event.isAllDay ? '' : b.event.startTime)
      return (aTime || '99:99').localeCompare(bTime || '99:99')
    })

    return { ...g, items }
  }).filter(g => g.items.length > 0), [groups, showTasks, showEvents, calActive, priorityFilter, labelFilter, folderFilter, calendarFilter])

  // Dot indicators: dates from unfiltered groups (shows content even when filters hide it)
  const datesWithContent = useMemo(
    () => new Set(groups.filter(g => !g.isOverdue).map(g => g.key)),
    [groups],
  )

  useEffect(() => {
    if (!activeDate) return
    const activeWeekStart = startOfWeek(parseISO(activeDate), { weekStartsOn: 1 })
    const todayWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const diffDays = Math.round((activeWeekStart.getTime() - todayWeekStart.getTime()) / 86400000)
    setWeekOffset(Math.round(diffDays / 7))
  }, [activeDate])

  const scrollToDate = useCallback((dateStr: string) => {
    if (!scrollRef.current) return
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-date="${dateStr}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const scrollToWeek = useCallback((offset: number) => {
    const weekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), offset * 7)
    const weekEnd = addDays(weekStart, 6)
    const startStr = format(weekStart, 'yyyy-MM-dd')
    const endStr = format(weekEnd, 'yyyy-MM-dd')
    const group = filtered.find(g => !g.isOverdue && g.key >= startStr && g.key <= endStr)
    if (group) scrollToDate(group.key)
  }, [filtered, scrollToDate])

  const handleDayClick = useCallback((dateStr: string) => {
    scrollToDate(dateStr)
    setActiveDate(dateStr)
  }, [scrollToDate])

  const handleTodayClick = useCallback(() => {
    setWeekOffset(0)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const target = filtered.find(g => !g.isOverdue && g.key === todayStr)
      ?? filtered.find(g => !g.isOverdue && g.key >= todayStr)
      ?? filtered.find(g => !g.isOverdue)
    if (target) scrollToDate(target.key)
    setActiveDate(todayStr)
  }, [filtered, scrollToDate])

  const handlePrev = useCallback(() => {
    const o = weekOffset - 1; setWeekOffset(o); scrollToWeek(o)
  }, [weekOffset, scrollToWeek])
  const handleNext = useCallback(() => {
    const o = weekOffset + 1; setWeekOffset(o); scrollToWeek(o)
  }, [weekOffset, scrollToWeek])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting && e.target.getAttribute('data-date'))
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          const date = visible[0].target.getAttribute('data-date')
          if (date) setActiveDate(date)
        }
      },
      { root: container, rootMargin: '-5% 0px -85% 0px', threshold: 0 },
    )
    container.querySelectorAll('[data-date]').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [filtered])

  return (
    <div className="flex flex-col h-full">
      <WeekStrip
        weekOffset={weekOffset} activeDate={activeDate}
        datesWithContent={datesWithContent}
        onDayClick={handleDayClick} onPrev={handlePrev}
        onNext={handleNext} onToday={handleTodayClick}
      />
      <FilterBar
        priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
        labelFilter={labelFilter} setLabelFilter={setLabelFilter}
        folderFilter={folderFilter} setFolderFilter={setFolderFilter}
        calendarFilter={calendarFilter} setCalendarFilter={setCalendarFilter}
        onClearAll={() => {
          setPriorityFilter([]); setLabelFilter([])
          setFolderFilter([]); setCalendarFilter([])
        }}
      />
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
          <FolderOpen size={40} className="opacity-20" />
          <p>No upcoming tasks</p>
          <Button variant="ghost" size="sm" onClick={() => setCreateTaskOpen(true)}>
            <Plus size={16} className="mr-1" /> Add task
          </Button>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-4">
          {filtered.map(group => (
            <div key={group.key} data-date={group.isOverdue ? undefined : group.key}>
              <div className={cn('px-2 py-1 text-sm font-bold mb-1', group.isOverdue ? 'text-red-400' : 'text-muted-foreground')}>
                {group.label}
              </div>
              {group.items.map(item =>
                item.type === 'task' ? (
                  <TaskItem key={item.task.id} task={item.task} depth={0} showFolder hideChildren hideDeadline />
                ) : (
                  <CalendarEventItem
                    key={item.event.id}
                    event={item.event}
                    showDate={false}
                    isEditable={['owner', 'writer'].includes(calendars.find(c => c.id === item.event.calendarId)?.accessRole ?? '')}
                    onEdit={() => onEditCalendarEvent(item.event)}
                    onDelete={() => void handleDelete(item.event)}
                    onDeleteSeries={() => void handleDeleteSeries(item.event)}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Folder view with drag-and-drop ────────────────────────────────────────────

function FolderView() {
  const tasks = useFilteredRootTasks()
  const { updateTask } = useTasksStore()
  const { setCreateTaskOpen } = useUIStore()
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks)

  useEffect(() => { setLocalTasks(tasks) }, [tasks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over, delta } = event
    if (!over || active.id === over.id) return

    const draggedId = active.id as string
    const overId = over.id as string
    const oldIndex = localTasks.findIndex(t => t.id === draggedId)
    const newIndex = localTasks.findIndex(t => t.id === overId)

    if (delta.x > 50) {
      const targetTask = localTasks[newIndex]
      if (targetTask && targetTask.id !== draggedId) {
        await updateTask(draggedId, { parent_id: targetTask.id })
        scheduleFlush()
      }
      return
    }

    if (oldIndex === newIndex) return
    const reordered = arrayMove(localTasks, oldIndex, newIndex)
    setLocalTasks(reordered)
    for (let i = 0; i < reordered.length; i++) {
      await updateTask(reordered[i].id, { sort_order: i * 10 })
    }
    scheduleFlush()
  }, [localTasks, updateTask])

  if (localTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <FolderOpen size={40} className="opacity-20" />
        <p>No tasks</p>
        <Button variant="ghost" size="sm" onClick={() => setCreateTaskOpen(true)}>
          <Plus size={16} className="mr-1" /> Add task
        </Button>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
      <SortableContext items={localTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="p-2">
          {localTasks.map(task => (
            <SortableTaskRow key={task.id} task={task} showFolder={false} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

// ── All tasks view — F-04: tasks + events, flat sorted ────────────────────────

function AllTasksView({ onEditCalendarEvent }: { onEditCalendarEvent: (e: CalendarEvent) => void }) {
  const allTasks = useAllTasks()
  const allEvents = useCalendarStore(s => s.events)
  const calendars = useCalendarStore(s => s.calendars)
  const calendarEnabled = usePrefsStore(s => s.calendarEnabled)
  const { setCreateTaskOpen } = useUIStore()
  const { handleDelete, handleDeleteSeries } = useEventHandlers()

  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [labelFilter, setLabelFilter] = useState<string[]>([])
  const [folderFilter, setFolderFilter] = useState<string[]>([])
  const [calendarFilter, setCalendarFilter] = useState<string[]>([])

  const { showTasks, showEvents, calActive } = filterMatrix(priorityFilter, labelFilter, folderFilter, calendarFilter)

  // Events in today..today+366 range
  const today = startOfDay(new Date())
  const maxDate = addDays(today, 366)
  const futureEvents = useMemo(() => {
    if (!calendarEnabled) return []
    return allEvents.filter(e => {
      const d = parseISO(e.startDate)
      return !isBefore(d, today) && isBefore(d, maxDate)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, calendarEnabled])

  // Apply filters
  const filteredTasks = showTasks
    ? applyTaskFilters(allTasks, priorityFilter, labelFilter, folderFilter)
    : []

  const filteredEvents = showEvents
    ? applyCalendarFilterFn(futureEvents, calActive ? calendarFilter : [])
    : []

  // Merge + sort: priority first, then date+time; no-date tasks at end
  const merged = useMemo(() => {
    const PRIORITY_RANK: Record<string, number> = { urgent: 0, important: 1, normal: 2 }
    type Entry = {
      sortDate: string; sortTime: string; sortPriority: number
      item: Task | CalendarEvent; isTask: boolean
    }

    const entries: Entry[] = [
      ...filteredTasks.map(t => ({
        sortDate: t.deadline_date || '9999-12-31',
        sortTime: t.deadline_time || '99:99',
        sortPriority: PRIORITY_RANK[t.priority] ?? 2,
        item: t as Task | CalendarEvent,
        isTask: true,
      })),
      ...filteredEvents.map(e => ({
        sortDate: e.startDate,
        sortTime: e.isAllDay ? '99:99' : e.startTime,
        sortPriority: 2,   // events ranked as "normal"
        item: e as Task | CalendarEvent,
        isTask: false,
      })),
    ]

    entries.sort((a, b) => {
      // Tasks with no deadline always go last
      const aNoDate = a.isTask && !(a.item as Task).deadline_date
      const bNoDate = b.isTask && !(b.item as Task).deadline_date
      if (aNoDate && bNoDate) return a.sortPriority - b.sortPriority
      if (aNoDate) return 1
      if (bNoDate) return -1

      // Dated items: priority first
      if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority

      // Same priority → date then time
      const dc = a.sortDate.localeCompare(b.sortDate)
      if (dc !== 0) return dc
      return a.sortTime.localeCompare(b.sortTime)
    })

    return entries
  }, [filteredTasks, filteredEvents])

  return (
    <div className="flex flex-col h-full">
      <FilterBar
        priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
        labelFilter={labelFilter} setLabelFilter={setLabelFilter}
        folderFilter={folderFilter} setFolderFilter={setFolderFilter}
        calendarFilter={calendarFilter} setCalendarFilter={setCalendarFilter}
        onClearAll={() => {
          setPriorityFilter([]); setLabelFilter([])
          setFolderFilter([]); setCalendarFilter([])
        }}
      />
      {merged.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
          <FolderOpen size={40} className="opacity-20" />
          <p>No tasks</p>
          <Button variant="ghost" size="sm" onClick={() => setCreateTaskOpen(true)}>
            <Plus size={16} className="mr-1" /> Add task
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {merged.map(entry =>
            entry.isTask ? (
              <TaskItem key={(entry.item as Task).id} task={entry.item as Task} depth={0} showFolder hideChildren />
            ) : (
              <CalendarEventItem
                key={(entry.item as CalendarEvent).id}
                event={entry.item as CalendarEvent}
                showDate={true}
                isEditable={['owner', 'writer'].includes(calendars.find(c => c.id === (entry.item as CalendarEvent).calendarId)?.accessRole ?? '')}
                onEdit={() => onEditCalendarEvent(entry.item as CalendarEvent)}
                onDelete={() => void handleDelete(entry.item as CalendarEvent)}
                onDeleteSeries={() => void handleDeleteSeries(entry.item as CalendarEvent)}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

// ── Completed view ────────────────────────────────────────────────────────────

function CompletedView() {
  const tasks = useCompletedTasks()
  const { folders } = useFoldersStore()
  const { labels } = useLabelsStore()
  const { updateTask, deleteTask } = useTasksStore()
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [labelFilter, setLabelFilter] = useState<string[]>([])
  const [folderFilter, setFolderFilter] = useState<string[]>([])
  const [calendarFilter, setCalendarFilter] = useState<string[]>([])

  const filtered = applyFilters(tasks, priorityFilter, labelFilter, folderFilter)

  return (
    <div className="flex flex-col h-full">
      <FilterBar
        priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
        labelFilter={labelFilter} setLabelFilter={setLabelFilter}
        folderFilter={folderFilter} setFolderFilter={setFolderFilter}
        calendarFilter={calendarFilter} setCalendarFilter={setCalendarFilter}
        onClearAll={() => {
          setPriorityFilter([]); setLabelFilter([])
          setFolderFilter([]); setCalendarFilter([])
        }}
      />
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
          <FolderOpen size={40} className="opacity-20" />
          <p>No completed tasks</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map(task => {
            const folder = folders.find(f => f.id === task.folder_id)
            const labelIds = task.labels.split(',').filter(Boolean)
            return (
              <div
                key={task.id}
                className="flex items-start gap-2 px-2 py-2 border-b border-border/40 hover:bg-accent/30 transition-colors group"
              >
                <button
                  onClick={() => void updateTask(task.id, { status: 'pending', completed_at: '' })}
                  className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                  title="Mark as pending"
                >
                  <RotateCcw size={16} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-base line-through opacity-70">{task.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground flex-wrap">
                    {task.completed_at && <span>{formatCompletedAt(task.completed_at)}</span>}
                    {labelIds.map(id => {
                      const label = labels.find(l => l.id === id)
                      return label ? (
                        <span key={id} className="flex items-center gap-1" style={{ color: label.color }}>
                          <Tag size={12} />
                          {label.name}
                        </span>
                      ) : null
                    })}
                    {folder && (
                      <span className="flex items-center gap-1" style={{ color: folder.color }}>
                        <Folder size={12} />
                        {folder.name}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => void deleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Calendar event list view — G-04 ──────────────────────────────────────────

function CalendarEventListView({ onEditCalendarEvent }: { onEditCalendarEvent: (e: CalendarEvent) => void }) {
  const { selectedCalendarId } = useUIStore()
  const calendarEnabled = usePrefsStore(s => s.calendarEnabled)
  const events = useCalendarEvents(selectedCalendarId ?? '')
  const { handleDelete, handleDeleteSeries } = useEventHandlers()
  const calendars = useCalendarStore(s => s.calendars)

  const today = startOfDay(new Date())

  const groups = useMemo(() => {
    const map = new Map<string, {
      key: string; label: string; isOverdue: boolean; events: CalendarEvent[]
    }>()

    for (const event of events) {
      const date = parseISO(event.startDate)
      const isOver = isBefore(date, today)
      const key = isOver ? 'overdue' : event.startDate

      if (!map.has(key)) {
        map.set(key, {
          key,
          label: isOver ? 'Overdue' : formatDayGroupLabel(event.startDate),
          isOverdue: isOver,
          events: [],
        })
      }
      map.get(key)!.events.push(event)
    }

    const result = Array.from(map.values())
    result.sort((a, b) => {
      if (a.isOverdue) return -1
      if (b.isOverdue) return 1
      return a.key.localeCompare(b.key)
    })
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  if (!calendarEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-6 text-center">
        <CalendarDays size={40} className="opacity-20" />
        <p className="text-sm">Enable Google Calendar in Settings to see events here.</p>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <CalendarDays size={40} className="opacity-20" />
        <p>No events</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-4">
      {groups.map(group => (
        <div key={group.key}>
          <div className={cn('px-2 py-1 text-sm font-bold mb-1', group.isOverdue ? 'text-red-400' : 'text-muted-foreground')}>
            {group.label}
          </div>
          {group.events.map(event => (
            <CalendarEventItem
              key={event.id}
              event={event}
              showDate={false}
              isEditable={['owner', 'writer'].includes(calendars.find(c => c.id === event.calendarId)?.accessRole ?? '')}
              onEdit={() => onEditCalendarEvent(event)}
              onDelete={() => void handleDelete(event)}
              onDeleteSeries={() => void handleDeleteSeries(event)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Main TaskList ─────────────────────────────────────────────────────────────

export function TaskList() {
  const { selectedView, selectedCalendarId, createTaskOpen, setCreateTaskOpen } = useUIStore()
  const [editingCalendarEvent, setEditingCalendarEvent] = useState<CalendarEvent | null>(null)

  const handleEditCalendarEvent = useCallback((event: CalendarEvent) => {
    setEditingCalendarEvent(event)
  }, [])

  const handleModalClose = useCallback(() => {
    setCreateTaskOpen(false)
    setEditingCalendarEvent(null)
  }, [setCreateTaskOpen])

  const renderContent = () => {
    if (selectedView === 'upcoming') return <UpcomingView onEditCalendarEvent={handleEditCalendarEvent} />
    if (selectedView === 'all') return <AllTasksView onEditCalendarEvent={handleEditCalendarEvent} />
    if (selectedView === 'completed') return <CompletedView />
    if (selectedView === 'calendar') return <CalendarEventListView onEditCalendarEvent={handleEditCalendarEvent} />
    return <FolderView />
  }

  const showFab = ['upcoming', 'all', 'folder', 'calendar'].includes(selectedView)

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>
      {showFab && (
        <button
          onClick={() => setCreateTaskOpen(true)}
          className="absolute bottom-5 right-5 z-20 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors active:scale-95"
          aria-label="Add new"
        >
          <Plus size={24} />
        </button>
      )}
      <TaskCreateModal
        open={createTaskOpen || editingCalendarEvent !== null}
        editingEvent={editingCalendarEvent}
        defaultMode={selectedView === 'calendar' ? 'event' : undefined}
        defaultCalendarId={selectedView === 'calendar' ? (selectedCalendarId ?? undefined) : undefined}
        onClose={handleModalClose}
      />
    </div>
  )
}
