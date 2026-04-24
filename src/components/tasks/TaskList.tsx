import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, FolderOpen, Trash2, RotateCcw, Flag, Tag, ChevronLeft, ChevronRight, Calendar, Folder } from 'lucide-react'
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
import { format, startOfWeek, addDays, parseISO } from 'date-fns'
import { TaskItem } from './TaskItem'
import { TaskCreateModal } from './TaskCreateModal'
import { useUpcomingGroups, useFilteredRootTasks, useCompletedTasks, useAllTasks, useLabelTasks, usePriorityTasks } from '@/hooks/useTasks'
import { useUIStore } from '@/store/uiStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useLabelsStore } from '@/store/labelsStore'
import { useTasksStore } from '@/store/tasksStore'
import { formatCompletedAt } from '@/utils/dateUtils'
import { scheduleFlush } from '@/services/syncService'
import { cn } from '@/lib/utils'
import type { Task } from '@/types/task'

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
      {/* Drag handle */}
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

// ── Filter bar: priority / label / folder dropdown multi-select ───────────────

function FilterBar({
  priorityFilter, setPriorityFilter,
  labelFilter, setLabelFilter,
  folderFilter, setFolderFilter,
}: {
  priorityFilter: string[]
  setPriorityFilter: (v: string[]) => void
  labelFilter: string[]
  setLabelFilter: (v: string[]) => void
  folderFilter: string[]
  setFolderFilter: (v: string[]) => void
}) {
  const { labels } = useLabelsStore()
  const { folders } = useFoldersStore()

  const togglePriority = (id: string) =>
    setPriorityFilter(priorityFilter.includes(id) ? priorityFilter.filter(p => p !== id) : [...priorityFilter, id])
  const toggleLabel = (id: string) =>
    setLabelFilter(labelFilter.includes(id) ? labelFilter.filter(l => l !== id) : [...labelFilter, id])
  const toggleFolder = (id: string) =>
    setFolderFilter(folderFilter.includes(id) ? folderFilter.filter(f => f !== id) : [...folderFilter, id])

  const priorityActive = priorityFilter.length > 0
  const labelActive = labelFilter.length > 0
  const folderActive = folderFilter.length > 0

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b">
      {/* Priority */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn('p-1.5 rounded transition-colors hover:bg-accent', priorityActive && 'bg-accent')}>
            <Flag size={14} className={priorityActive ? 'text-foreground' : 'text-muted-foreground'} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[140px]">
          {PRIORITY_OPTS.map(p => (
            <DropdownMenuItem key={p.id} onSelect={(e) => { e.preventDefault(); togglePriority(p.id) }}>
              <Flag size={14} className="mr-2" style={{ color: p.color }} />
              {p.title}
              {priorityFilter.includes(p.id) && <span className="ml-auto pl-2 text-primary">✓</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Label */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn('p-1.5 rounded transition-colors hover:bg-accent', labelActive && 'bg-accent')}
            disabled={labels.length === 0}
          >
            <Tag size={14} className={labelActive ? 'text-foreground' : 'text-muted-foreground'} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[140px]">
          {labels.map(l => (
            <DropdownMenuItem key={l.id} onSelect={(e) => { e.preventDefault(); toggleLabel(l.id) }}>
              <Tag size={14} className="mr-2" style={{ color: l.color }} />
              <span style={{ color: l.color }}>{l.name}</span>
              {labelFilter.includes(l.id) && <span className="ml-auto pl-2 text-primary">✓</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Folder */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn('p-1.5 rounded transition-colors hover:bg-accent', folderActive && 'bg-accent')}
            disabled={folders.length === 0}
          >
            <Folder size={14} className={folderActive ? 'text-foreground' : 'text-muted-foreground'} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[140px]">
          {folders.map(f => (
            <DropdownMenuItem key={f.id} onSelect={(e) => { e.preventDefault(); toggleFolder(f.id) }}>
              <Folder size={14} className="mr-2" style={{ color: f.color }} />
              {f.name}
              {folderFilter.includes(f.id) && <span className="ml-auto pl-2 text-primary">✓</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ── Filter helper ─────────────────────────────────────────────────────────────

function applyFilters(
  tasks: Task[],
  priorityFilter: string[],
  labelFilter: string[],
  folderFilter: string[],
) {
  return tasks.filter(t => {
    if (priorityFilter.length > 0 && !priorityFilter.includes(t.priority)) return false
    if (labelFilter.length > 0 && !labelFilter.some(id => t.labels.split(',').filter(Boolean).includes(id))) return false
    if (folderFilter.length > 0 && !folderFilter.includes(t.folder_id)) return false
    return true
  })
}

// ── Week navigation strip ─────────────────────────────────────────────────────

function WeekStrip({
  weekOffset,
  activeDate,
  datesWithTasks,
  onDayClick,
  onPrev,
  onNext,
  onToday,
}: {
  weekOffset: number
  activeDate: string | null
  datesWithTasks: Set<string>
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
      <button
        onClick={onPrev}
        className="p-1 rounded hover:bg-accent text-foreground/60 hover:text-foreground transition-colors flex-shrink-0"
      >
        <ChevronLeft size={14} />
      </button>

      <div className="flex flex-1 gap-0.5">
        {weekDays.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const isToday = dateStr === todayStr
          const isActive = activeDate === dateStr
          const hasTasks = datesWithTasks.has(dateStr)
          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={cn(
                'flex-1 flex flex-col items-center py-1 rounded transition-colors',
                isActive ? 'bg-accent' : 'hover:bg-accent/50',
              )}
            >
              <span className={cn(
                'text-xs font-medium leading-tight',
                isToday ? 'text-green-600' : isActive ? 'text-foreground' : 'text-foreground/70',
              )}>
                {format(day, 'd')}
              </span>
              <span className={cn(
                'text-xs leading-tight',
                isToday ? 'text-green-600' : isActive ? 'text-foreground/70' : 'text-foreground/50',
              )}>
                {format(day, 'EEEEE')}
              </span>
              <span className={cn(
                'w-1 h-1 rounded-full mt-0.5',
                hasTasks
                  ? isToday ? 'bg-green-600' : 'bg-primary'
                  : 'bg-transparent',
              )} />
            </button>
          )
        })}
      </div>

      <button
        onClick={onToday}
        className={cn(
          'p-1 rounded border flex-shrink-0 transition-colors',
          weekOffset === 0 ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:bg-accent',
        )}
        title="Go to today"
      >
        <Calendar size={14} />
      </button>

      <button
        onClick={onNext}
        className="p-1 rounded hover:bg-accent text-foreground/60 hover:text-foreground transition-colors flex-shrink-0"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}

// ── Upcoming view ─────────────────────────────────────────────────────────────

function UpcomingView() {
  const groups = useUpcomingGroups()
  const { setCreateTaskOpen } = useUIStore()
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [labelFilter, setLabelFilter] = useState<string[]>([])
  const [folderFilter, setFolderFilter] = useState<string[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [activeDate, setActiveDate] = useState<string | null>(() => format(new Date(), 'yyyy-MM-dd'))
  const scrollRef = useRef<HTMLDivElement>(null)

  const filtered = groups
    .map(g => ({
      ...g,
      tasks: applyFilters(g.tasks, priorityFilter, labelFilter, folderFilter),
    }))
    .filter(g => g.tasks.length > 0)

  // Set of date keys that have tasks (for dot indicator)
  const datesWithTasks = useMemo(() => {
    return new Set(groups.filter(g => !g.isOverdue).map(g => g.key))
  }, [groups])

  // Auto-advance week strip when scroll moves activeDate to a different week
  useEffect(() => {
    if (!activeDate) return
    const activeWeekStart = startOfWeek(parseISO(activeDate), { weekStartsOn: 1 })
    const todayWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const diffDays = Math.round((activeWeekStart.getTime() - todayWeekStart.getTime()) / 86400000)
    setWeekOffset(Math.round(diffDays / 7))
  }, [activeDate])

  // Scroll to the group element for a given date key
  const scrollToDate = useCallback((dateStr: string) => {
    if (!scrollRef.current) return
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-date="${dateStr}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Find the first visible (filtered) group in a given week offset and scroll to it
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
    const todayGroup = filtered.find(g => !g.isOverdue && g.key === todayStr)
    const nearestGroup = filtered.find(g => !g.isOverdue && g.key >= todayStr)
      ?? filtered.find(g => !g.isOverdue)
    const target = todayGroup ?? nearestGroup
    if (target) scrollToDate(target.key)
    setActiveDate(todayStr)
  }, [filtered, scrollToDate])

  const handlePrev = useCallback(() => {
    const newOffset = weekOffset - 1
    setWeekOffset(newOffset)
    scrollToWeek(newOffset)
  }, [weekOffset, scrollToWeek])

  const handleNext = useCallback(() => {
    const newOffset = weekOffset + 1
    setWeekOffset(newOffset)
    scrollToWeek(newOffset)
  }, [weekOffset, scrollToWeek])

  // IntersectionObserver to track which date group is at the top
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries
          .filter(e => e.isIntersecting && e.target.getAttribute('data-date'))
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (intersecting.length > 0) {
          const date = intersecting[0].target.getAttribute('data-date')
          if (date) setActiveDate(date)
        }
      },
      { root: container, rootMargin: '-5% 0px -85% 0px', threshold: 0 },
    )

    const elements = container.querySelectorAll('[data-date]')
    elements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [filtered])

  return (
    <div className="flex flex-col h-full">
      <WeekStrip
        weekOffset={weekOffset}
        activeDate={activeDate}
        datesWithTasks={datesWithTasks}
        onDayClick={handleDayClick}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleTodayClick}
      />
      <FilterBar
        priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
        labelFilter={labelFilter} setLabelFilter={setLabelFilter}
        folderFilter={folderFilter} setFolderFilter={setFolderFilter}
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
              <div className={cn(
                'px-2 py-1 text-sm font-bold mb-1',
                group.isOverdue ? 'text-red-400'
                  : group.isToday ? 'text-green-600'
                  : group.isTomorrow ? 'text-orange-400'
                  : 'text-muted-foreground',
              )}>
                {group.label}
              </div>
              {group.tasks.map(task => (
                <TaskItem key={task.id} task={task} depth={0} showFolder={true} hideChildren hideDeadline />
              ))}
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

  // Sync local state when external tasks change (but not during drag)
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

    // Drag right (>50px) → reparent dragged task under the "over" task
    if (delta.x > 50) {
      const targetTask = localTasks[newIndex]
      if (targetTask && targetTask.id !== draggedId) {
        await updateTask(draggedId, { parent_id: targetTask.id })
        scheduleFlush()
      }
      return
    }

    // Normal vertical reorder
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

// ── All tasks view ────────────────────────────────────────────────────────────

function AllTasksView() {
  const allTasks = useAllTasks()
  const { setCreateTaskOpen } = useUIStore()
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [labelFilter, setLabelFilter] = useState<string[]>([])
  const [folderFilter, setFolderFilter] = useState<string[]>([])

  const filtered = applyFilters(allTasks, priorityFilter, labelFilter, folderFilter)

  return (
    <div className="flex flex-col h-full">
      <FilterBar
        priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
        labelFilter={labelFilter} setLabelFilter={setLabelFilter}
        folderFilter={folderFilter} setFolderFilter={setFolderFilter}
      />
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
          <FolderOpen size={40} className="opacity-20" />
          <p>No tasks</p>
          <Button variant="ghost" size="sm" onClick={() => setCreateTaskOpen(true)}>
            <Plus size={16} className="mr-1" /> Add task
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map(task => (
            <TaskItem key={task.id} task={task} depth={0} showFolder={true} hideChildren />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Label view ────────────────────────────────────────────────────────────────

function LabelView() {
  const labelTasks = useLabelTasks()
  const { setCreateTaskOpen } = useUIStore()
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [labelFilter, setLabelFilter] = useState<string[]>([])
  const [folderFilter, setFolderFilter] = useState<string[]>([])

  const filtered = applyFilters(labelTasks, priorityFilter, labelFilter, folderFilter)

  return (
    <div className="flex flex-col h-full">
      <FilterBar
        priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
        labelFilter={labelFilter} setLabelFilter={setLabelFilter}
        folderFilter={folderFilter} setFolderFilter={setFolderFilter}
      />
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
          <FolderOpen size={40} className="opacity-20" />
          <p>No tasks</p>
          <Button variant="ghost" size="sm" onClick={() => setCreateTaskOpen(true)}>
            <Plus size={16} className="mr-1" /> Add task
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map(task => (
            <TaskItem key={task.id} task={task} depth={0} showFolder={true} hideChildren hideLabels />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Priority view ─────────────────────────────────────────────────────────────

function PriorityView() {
  const priorityTasks = usePriorityTasks()
  const { setCreateTaskOpen } = useUIStore()

  return (
    <div className="flex flex-col h-full">
      {priorityTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
          <FolderOpen size={40} className="opacity-20" />
          <p>No tasks</p>
          <Button variant="ghost" size="sm" onClick={() => setCreateTaskOpen(true)}>
            <Plus size={16} className="mr-1" /> Add task
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {priorityTasks.map(task => (
            <TaskItem key={task.id} task={task} depth={0} showFolder={true} hideChildren />
          ))}
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

  const filtered = applyFilters(tasks, priorityFilter, labelFilter, folderFilter)

  return (
    <div className="flex flex-col h-full">
      <FilterBar
        priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
        labelFilter={labelFilter} setLabelFilter={setLabelFilter}
        folderFilter={folderFilter} setFolderFilter={setFolderFilter}
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

// ── Main TaskList ─────────────────────────────────────────────────────────────

export function TaskList() {
  const { selectedView, createTaskOpen, setCreateTaskOpen } = useUIStore()

  const renderContent = () => {
    if (selectedView === 'upcoming') return <UpcomingView />
    if (selectedView === 'all') return <AllTasksView />
    if (selectedView === 'label') return <LabelView />
    if (selectedView === 'priority') return <PriorityView />
    if (selectedView === 'completed') return <CompletedView />
    return <FolderView />
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>
      <TaskCreateModal open={createTaskOpen} onClose={() => setCreateTaskOpen(false)} />
    </div>
  )
}
