import { useState, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, Clock, Tag, Flag, Pencil, Trash2, RefreshCw, Plus, MoreHorizontal, ListChecks } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { TaskCreateModal } from './TaskCreateModal'
import { TaskChildren } from './TaskChildren'
import { TimePickerDialog } from './TimePickerDialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { useTasksStore } from '@/store/tasksStore'
import { useLabelsStore } from '@/store/labelsStore'
import { useFoldersStore } from '@/store/foldersStore'
import { getNextDueDate } from '@/services/recurrenceService'
import { getDeadlineStatus, formatTaskDeadlineLabel } from '@/utils/dateUtils'

import { cn } from '@/lib/utils'
import type { Task, Priority } from '@/types/task'

// ─── Label picker ─────────────────────────────────────────────────────────────

function LabelPicker({ taskId, currentLabels, onClose }: {
  taskId: string; currentLabels: string[]; onClose: () => void
}) {
  const { labels } = useLabelsStore()
  const { updateTask } = useTasksStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const toggle = async (labelId: string) => {
    const next = currentLabels.includes(labelId)
      ? currentLabels.filter(l => l !== labelId)
      : [...currentLabels, labelId]
    await updateTask(taskId, { labels: next.join(',') })
  }

  if (labels.length === 0) {
    return (
      <div ref={ref} className="absolute z-50 mt-1 right-0 bg-popover border rounded-lg shadow-lg p-3 text-sm text-muted-foreground whitespace-nowrap">
        Create labels in the sidebar.
      </div>
    )
  }

  return (
    <div ref={ref} className="absolute z-50 mt-1 right-0 bg-popover border rounded-lg shadow-lg p-1 min-w-[160px]">
      {labels.map(l => {
        const active = currentLabels.includes(l.id)
        return (
          <button
            key={l.id}
            onClick={() => void toggle(l.id)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-accent"
          >
            <Tag size={12} style={{ color: l.color }} />
            <span className="flex-1 text-left" style={{ color: l.color }}>{l.name}</span>
            {active && <span className="text-primary font-bold">✓</span>}
          </button>
        )
      })}
    </div>
  )
}

// ─── Priority picker ──────────────────────────────────────────────────────────

function PriorityPicker({ taskId, current, onClose }: {
  taskId: string; current: Priority; onClose: () => void
}) {
  const { updateTask } = useTasksStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const options: { value: Priority; label: string; color: string }[] = [
    { value: 'urgent', label: 'Urgent', color: '#f87171' },
    { value: 'important', label: 'Important', color: '#fb923c' },
    { value: 'normal', label: 'Normal', color: '#9ca3af' },
  ]

  return (
    <div ref={ref} className="absolute z-50 mt-1 right-0 bg-popover border rounded-lg shadow-lg p-1 min-w-[160px]">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => { void updateTask(taskId, { priority: o.value }); onClose() }}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-accent"
        >
          <Flag size={14} style={{ color: o.color }} />
          <span className="flex-1 text-left">{o.label}</span>
          {current === o.value && <span className="text-primary font-bold">✓</span>}
        </button>
      ))}
    </div>
  )
}

function priorityColor(p: Priority): string {
  if (p === 'urgent') return '#f87171'
  if (p === 'important') return '#fb923c'
  return '#9ca3af'
}

// ─── TaskItem ─────────────────────────────────────────────────────────────────

interface Props {
  task: Task
  depth: number
  showFolder?: boolean
  hideChildren?: boolean
}

export function TaskItem({ task, depth, showFolder = false, hideChildren = false }: Props) {
  const [expanded, setExpanded] = useState(task.is_expanded !== false)
  useEffect(() => { setExpanded(task.is_expanded !== false) }, [task.is_expanded])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addChildOpen, setAddChildOpen] = useState(false)
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false)
  const [timePickerOpen, setTimePickerOpen] = useState(false)

  const { completeTask, updateTask, deleteTask, getChildren, setTaskExpanded } = useTasksStore()
  const { labels } = useLabelsStore()
  const { folders } = useFoldersStore()

  const allChildren = getChildren(task.id)
  const children = allChildren.filter(t => t.status === 'pending')
  const completedChildCount = allChildren.filter(t => t.status === 'completed').length
  const totalChildCount = allChildren.length
  const labelIds = task.labels.split(',').filter(Boolean)
  const isCompleted = task.status === 'completed'
  const folder = folders.find(f => f.id === task.folder_id)

  const deadlineStatus = task.deadline_date ? getDeadlineStatus(task.deadline_date, task.deadline_time) : null
  const timeColorClass = deadlineStatus === 'overdue' ? 'text-red-400'
    : deadlineStatus === 'today' ? 'text-emerald-500'
    : deadlineStatus === 'tomorrow' ? 'text-orange-400'
    : deadlineStatus === 'week' ? 'text-violet-400'
    : 'text-muted-foreground'

  const hasSecondLine = task.deadline_date || labelIds.length > 0 || (folder && showFolder) || task.is_recurring || totalChildCount > 0

  const handleComplete = async () => {
    if (task.is_recurring && task.deadline_date) {
      const nextDate = getNextDueDate(task)
      if (nextDate) {
        await updateTask(task.id, { deadline_date: nextDate })
        // Flush immediately so the new date reaches Sheets before the user
        // closes the app — recurring tasks only advance the date, never complete,
        // so they bypass completeTask's own immediate flush.
        void import('@/services/syncService').then(({ flush }) => { void flush() })
      }
    } else {
      await completeTask(task.id)
    }
  }

  return (
    <div>
      <div
        className={cn(
          'flex flex-col hover:bg-accent/40 border-b border-border/40 transition-colors',
          isCompleted && 'opacity-50',
        )}
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {/* Row 1: expand, checkbox, title, action icons */}
        <div className={cn('flex items-center gap-1.5 px-2', hasSecondLine ? 'pt-2 pb-0.5' : 'py-2')}>
          {/* Expand/collapse */}
          {!hideChildren && children.length > 0 ? (
            <button
              onClick={() => {
                const next = !expanded
                setExpanded(next)
                void setTaskExpanded(task.id, next)
              }}
              className="text-muted-foreground hover:text-foreground flex-shrink-0 p-0.5"
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <span className="w-5 flex-shrink-0" />
          )}

          {/* Checkbox */}
          <Checkbox
            checked={isCompleted}
            onCheckedChange={(v) => { if (v) void handleComplete() }}
            className={cn(
              'flex-shrink-0',
              task.priority === 'urgent' && 'border-red-400 data-[state=checked]:bg-red-400 data-[state=checked]:border-red-400',
              task.priority === 'important' && 'border-orange-400 data-[state=checked]:bg-orange-400 data-[state=checked]:border-orange-400',
            )}
          />

          {/* Title */}
          <span
            className={cn('flex-1 text-base cursor-default leading-snug', isCompleted && 'line-through')}
          >
            {task.title}
          </span>

          {/* Action icons — desktop (md+): all visible */}
          <div className="hidden md:flex items-center flex-shrink-0">
            <button
              onClick={() => setTimePickerOpen(true)}
              className={cn(
                'p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors',
                task.deadline_date && timeColorClass,
              )}
              title="Set deadline"
            >
              <Clock size={15} />
            </button>

            <div className="relative">
              <button
                onClick={() => { setPriorityPickerOpen(!priorityPickerOpen); setLabelPickerOpen(false) }}
                className="p-1.5 rounded hover:bg-accent transition-colors"
                title="Priority"
              >
                <Flag size={15} style={{ color: priorityColor(task.priority) }} />
              </button>
              {priorityPickerOpen && (
                <PriorityPicker taskId={task.id} current={task.priority} onClose={() => setPriorityPickerOpen(false)} />
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => { setLabelPickerOpen(!labelPickerOpen); setPriorityPickerOpen(false) }}
                className={cn(
                  'p-1.5 rounded hover:bg-accent transition-colors',
                  labelIds.length > 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
                title="Labels"
              >
                <Tag size={15} />
              </button>
              {labelPickerOpen && (
                <LabelPicker taskId={task.id} currentLabels={labelIds} onClose={() => setLabelPickerOpen(false)} />
              )}
            </div>

            <button
              onClick={() => setAddChildOpen(true)}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Add subtask"
            >
              <Plus size={15} />
            </button>

            <button
              onClick={() => setEditOpen(true)}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Edit"
            >
              <Pencil size={15} />
            </button>

            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
              title="Delete"
            >
              <Trash2 size={15} />
            </button>
          </div>

          {/* Action icons — mobile: Clock + "..." with submenus */}
          <div className="flex md:hidden items-center flex-shrink-0">
            <button
              onClick={() => setTimePickerOpen(true)}
              className={cn(
                'p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors',
                task.deadline_date && timeColorClass,
              )}
            >
              <Clock size={15} />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                  <MoreHorizontal size={15} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Flag size={14} className="mr-2" style={{ color: priorityColor(task.priority) }} />
                    Priority
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {([
                      { value: 'urgent', label: 'Urgent', color: '#f87171' },
                      { value: 'important', label: 'Important', color: '#fb923c' },
                      { value: 'normal', label: 'Normal', color: '#9ca3af' },
                    ] as const).map(p => (
                      <DropdownMenuItem
                        key={p.value}
                        onClick={() => void updateTask(task.id, { priority: p.value })}
                      >
                        <Flag size={14} className="mr-2" style={{ color: p.color }} />
                        {p.label}
                        {task.priority === p.value && <span className="ml-auto pl-2 text-primary">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Tag size={14} className={cn('mr-2', labelIds.length > 0 ? 'text-primary' : '')} />
                    Labels
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {labels.length === 0
                      ? <DropdownMenuItem disabled>Create labels in the sidebar</DropdownMenuItem>
                      : labels.map(l => {
                          const active = labelIds.includes(l.id)
                          return (
                            <DropdownMenuItem
                              key={l.id}
                              onClick={() => {
                                const next = active
                                  ? labelIds.filter(id => id !== l.id)
                                  : [...labelIds, l.id]
                                void updateTask(task.id, { labels: next.join(',') })
                              }}
                            >
                              <Tag size={14} className="mr-2" style={{ color: l.color }} />
                              <span style={{ color: l.color }}>{l.name}</span>
                              {active && <span className="ml-auto pl-2 text-primary">✓</span>}
                            </DropdownMenuItem>
                          )
                        })
                    }
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuItem onClick={() => setAddChildOpen(true)}>
                  <Plus size={14} className="mr-2" />
                  Add subtask
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil size={14} className="mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setConfirmDelete(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 size={14} className="mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Row 2: recurring icon + deadline label + labels + folder */}
        {hasSecondLine && (
          <div className="flex items-center gap-3 pl-[52px] pr-2 pb-2 text-sm flex-wrap">
            {task.is_recurring && (
              <RefreshCw size={12} className="text-muted-foreground opacity-60 flex-shrink-0" />
            )}
            {task.deadline_date && (
              <span className={cn('font-light', timeColorClass)}>
                {formatTaskDeadlineLabel(task.deadline_date, task.deadline_time)}
              </span>
            )}
            {labelIds.map(id => {
              const label = labels.find(l => l.id === id)
              return label ? (
                <span key={id} className="flex items-center gap-1" style={{ color: label.color }}>
                  <Tag size={12} />
                  {label.name}
                </span>
              ) : null
            })}
            {folder && showFolder && (
              <span className="text-muted-foreground">{folder.name}</span>
            )}
            {totalChildCount > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground/70">
                <ListChecks size={12} />
                {completedChildCount}/{totalChildCount}
              </span>
            )}
          </div>
        )}
      </div>

      {!hideChildren && expanded && children.length > 0 && (
        <TaskChildren tasks={children} depth={depth + 1} showFolder={showFolder} />
      )}

      <TimePickerDialog open={timePickerOpen} task={task} onClose={() => setTimePickerOpen(false)} />
      <TaskCreateModal open={editOpen} editing={task} onClose={() => setEditOpen(false)} />
      <TaskCreateModal open={addChildOpen} parentId={task.id} onClose={() => setAddChildOpen(false)} />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete task?"
        description="The task and all subtasks will be deleted."
        confirmLabel="Delete"
        onConfirm={async () => { await deleteTask(task.id); setConfirmDelete(false) }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
