import { useState, useEffect, useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import { Plus, FolderOpen, Trash2, RotateCcw, Flag, Tag, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { format, startOfWeek, addDays } from 'date-fns'
import { TaskItem } from './TaskItem'
import { TaskCreateModal } from './TaskCreateModal'
import { useUpcomingGroups, useFilteredRootTasks, useCompletedTasks, useAllTasks, useLabelTasks } from '@/hooks/useTasks'
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
      {/* Drag handle — desktop only */}
      <button
        {...attributes}
        {...listeners}
        className="hidden md:flex items-center px-1 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
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

// ── Upcoming filters ──────────────────────────────────────────────────────────

const PRIORITY_OPTS = [
  { id: 'urgent',    color: '#f87171', title: 'Urgent' },
  { id: 'important', color: '#fb923c', title: 'Important' },
  { id: 'normal',    color: '#9ca3af', title: 'Normal' },
] as const

function UpcomingFilters({
  priorityFilter, setPriorityFilter,
  labelFilter, setLabelFilter,
}: {
  priorityFilter: string | null
  setPriorityFilter: (v: string | null) => void
  labelFilter: string | null
  setLabelFilter: (v: string | null) => void
}) {
  const { labels } = useLabelsStore()

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-wrap">
      {/* Priority pills */}
      <div className="flex items-center gap-1">
        {PRIORITY_OPTS.map(p => (
          <button
            key={p.id}
            onClick={() => setPriorityFilter(priorityFilter === p.id ? null : p.id)}
            className={cn(
              'p-1.5 rounded transition-colors hover:bg-accent',
              priorityFilter === p.id && 'bg-accent',
            )}
            title={p.title}
          >
            <Flag size={14} style={{ color: p.color }} />
          </button>
        ))}
      </div>

      {/* Label pills */}
      {labels.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {labels.map(l => (
            <button
              key={l.id}
              onClick={() => setLabelFilter(labelFilter === l.id ? null : l.id)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-full border text-xs transition-colors hover:bg-accent',
                labelFilter === l.id ? 'bg-accent' : 'border-border',
              )}
              style={labelFilter === l.id ? { borderColor: l.color } : {}}
            >
              <Tag size={10} style={{ color: l.color }} />
              <span style={{ color: l.color }}>{l.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Week navigation strip ─────────────────────────────────────────────────────

function WeekStrip({
  weekOffset,
  setWeekOffset,
  activeDate,
  datesWithTasks,
  onDayClick,
}: {
  weekOffset: number
  setWeekOffset: Dispatch<SetStateAction<number>>
  activeDate: string | null
  datesWithTasks: Set<string>
  onDayClick: (dateStr: string) => void
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
        onClick={() => setWeekOffset(o => o - 1)}
        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
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
                isToday ? 'text-emerald-500' : isActive ? 'text-foreground' : 'text-muted-foreground',
              )}>
                {format(day, 'd')}
              </span>
              <span className={cn(
                'text-[10px] leading-tight',
                isToday ? 'text-emerald-500' : 'text-muted-foreground/70',
              )}>
                {format(day, 'EEEEE')}
              </span>
              <span className={cn(
                'w-1 h-1 rounded-full mt-0.5',
                hasTasks
                  ? isToday ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                  : 'bg-transparent',
              )} />
            </button>
          )
        })}
      </div>

      <button
        onClick={() => setWeekOffset(0)}
        className={cn(
          'text-[11px] px-1.5 py-0.5 rounded border flex-shrink-0 transition-colors',
          weekOffset === 0 ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:bg-accent',
        )}
      >
        Today
      </button>

      <button
        onClick={() => setWeekOffset(o => o + 1)}
        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
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
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [labelFilter, setLabelFilter] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [activeDate, setActiveDate] = useState<string | null>(() => format(new Date(), 'yyyy-MM-dd'))
  const scrollRef = useRef<HTMLDivElement>(null)

  const filtered = groups
    .map(g => ({
      ...g,
      tasks: g.tasks.filter(t => {
        if (priorityFilter && t.priority !== priorityFilter) return false
        if (labelFilter && !t.labels.split(',').filter(Boolean).includes(labelFilter)) return false
        return true
      }),
    }))
    .filter(g => g.tasks.length > 0)

  // Set of date keys that have tasks (for dot indicator)
  const datesWithTasks = useMemo(() => {
    return new Set(groups.filter(g => !g.isOverdue).map(g => g.key))
  }, [groups])

  // Scroll to a date group
  const scrollToDate = useCallback((dateStr: string) => {
    if (!scrollRef.current) return
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-date="${dateStr}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handleDayClick = useCallback((dateStr: string) => {
    scrollToDate(dateStr)
    setActiveDate(dateStr)
  }, [scrollToDate])

  const handleTodayClick = useCallback(() => {
    setWeekOffset(0)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    scrollToDate(todayStr)
    setActiveDate(todayStr)
  }, [scrollToDate])

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
        setWeekOffset={setWeekOffset}
        activeDate={activeDate}
        datesWithTasks={datesWithTasks}
        onDayClick={(d) => {
          if (d === format(new Date(), 'yyyy-MM-dd')) {
            handleTodayClick()
          } else {
            handleDayClick(d)
          }
        }}
      />
      <UpcomingFilters
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        labelFilter={labelFilter}
        setLabelFilter={setLabelFilter}
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
                'px-2 py-1 text-sm font-semibold mb-1',
                group.isOverdue ? 'text-red-400'
                  : group.isToday ? 'text-emerald-500'
                  : group.label === 'Tomorrow' ? 'text-orange-400'
                  : 'text-muted-foreground',
              )}>
                {group.label}
              </div>
              {group.tasks.map(task => (
                <TaskItem key={task.id} task={task} depth={0} showFolder={true} hideChildren />
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
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [labelFilter, setLabelFilter] = useState<string | null>(null)

  const filtered = allTasks.filter(t => {
    if (priorityFilter && t.priority !== priorityFilter) return false
    if (labelFilter && !t.labels.split(',').filter(Boolean).includes(labelFilter)) return false
    return true
  })

  return (
    <div className="flex flex-col h-full">
      <UpcomingFilters
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        labelFilter={labelFilter}
        setLabelFilter={setLabelFilter}
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
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)

  const filtered = labelTasks.filter(t => {
    if (priorityFilter && t.priority !== priorityFilter) return false
    return true
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b">
        <div className="flex items-center gap-1">
          {PRIORITY_OPTS.map(p => (
            <button
              key={p.id}
              onClick={() => setPriorityFilter(priorityFilter === p.id ? null : p.id)}
              className={cn(
                'p-1.5 rounded transition-colors hover:bg-accent',
                priorityFilter === p.id && 'bg-accent',
              )}
              title={p.title}
            >
              <Flag size={14} style={{ color: p.color }} />
            </button>
          ))}
        </div>
      </div>
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

// ── Completed view ────────────────────────────────────────────────────────────

function CompletedView() {
  const tasks = useCompletedTasks()
  const { folders } = useFoldersStore()
  const { labels } = useLabelsStore()
  const { updateTask, deleteTask } = useTasksStore()

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <FolderOpen size={40} className="opacity-20" />
        <p>No completed tasks</p>
      </div>
    )
  }

  return (
    <div className="p-2">
      {tasks.map(task => {
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
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: label.color }} />
                      {label.name}
                    </span>
                  ) : null
                })}
                {folder && <span>{folder.name}</span>}
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
  )
}

// ── Main TaskList ─────────────────────────────────────────────────────────────

export function TaskList() {
  const { selectedView, createTaskOpen, setCreateTaskOpen } = useUIStore()

  const renderContent = () => {
    if (selectedView === 'upcoming') return <UpcomingView />
    if (selectedView === 'all') return <AllTasksView />
    if (selectedView === 'label') return <LabelView />
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
