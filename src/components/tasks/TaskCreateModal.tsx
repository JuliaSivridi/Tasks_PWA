import { useEffect, useState, useRef } from 'react'
import { useForm, Controller, type SubmitHandler } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Flag, Check, Tag, Plus, Folder as FolderIcon, X, CalendarDays } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useTasksStore } from '@/store/tasksStore'
import { useUIStore } from '@/store/uiStore'
import { useLabelsStore } from '@/store/labelsStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useCalendarStore } from '@/store/calendarStore'
import { usePrefsStore } from '@/store/prefsStore'
import { createEvent, updateEvent, getEvent } from '@/api/calendarApi'
import { buildEventDateTime, buildEndDateTime, parseEventDateTimeFromDto } from '@/utils/calendarDateTime'
import { buildRRule, parseRRule, monthlyOptions, type RRuleFreq, type RRuleEnds } from '@/utils/rrule'
import { pullCalendar } from '@/services/syncService'
import { INBOX_FOLDER_ID, LABEL_COLOR_PRESETS } from '@/utils/constants'
import { cn } from '@/lib/utils'
import { parseSmartTitle } from '@/utils/smartTitle'
import { addDays, addWeeks, addMonths, addYears, format, parseISO, getDay } from 'date-fns'
import type { Task } from '@/types/task'
import type { CalendarEvent, CalendarEventDto } from '@/types/calendarEvent'

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  title:         z.string().min(1, 'Title is required'),
  priority:      z.enum(['urgent', 'important', 'normal']),
  parent_id:     z.string(),
  folder_id:     z.string(),
  labels:        z.string(),
  deadline_date: z.string(),
  deadline_time: z.string(),
  is_recurring:  z.boolean(),
  recur_type:    z.enum(['days', 'weeks', 'months', 'years', '']),
  recur_value:   z.number().min(1).max(365),
})

type FormValues = z.infer<typeof schema>

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  editing?: Task | null
  editingEvent?: CalendarEvent | null
  parentId?: string
  onClose: () => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_OPTIONS = [
  { value: 'urgent' as const,    label: 'Urgent',    color: '#f87171' },
  { value: 'important' as const, label: 'Important', color: '#fb923c' },
  { value: 'normal' as const,    label: 'Normal',    color: '#9ca3af' },
]

const RECUR_TYPE_TO_FREQ: Record<string, RRuleFreq> = {
  days: 'DAILY', weeks: 'WEEKLY', months: 'MONTHLY', years: 'YEARLY',
}

const WEEKDAY_TOKENS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
// JS getDay() → RRULE token
const JS_DAY_TO_TOKEN = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

// ── DTO → CalendarEvent helper ────────────────────────────────────────────────

function dtoToCalendarEvent(
  dto: CalendarEventDto,
  calendarId: string,
  calendarName: string,
  calendarColor: string,
): CalendarEvent {
  const { startDate, startTime, endTime, isAllDay } = parseEventDateTimeFromDto(dto)
  return {
    id: dto.id,
    calendarId,
    calendarName,
    calendarColor,
    title: dto.summary ?? '(No title)',
    startDate,
    startTime,
    endTime,
    isAllDay,
    recurringEventId: dto.recurringEventId ?? null,
  }
}

// ── Recurring-edit choice dialog (H-04) ──────────────────────────────────────

function EditRecurringDialog({
  open, onEditThis, onEditAll, onCancel,
}: {
  open: boolean
  onEditThis: () => void
  onEditAll: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm z-[70]">
        <DialogHeader>
          <DialogTitle>Edit recurring event?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start" onClick={onEditThis}>
            Edit this event only
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={onEditAll}>
            Edit all events in series
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── TaskCreateModal ───────────────────────────────────────────────────────────

export function TaskCreateModal({
  open, editing, editingEvent, parentId = '', onClose,
}: Props) {
  const { addTask, updateTask } = useTasksStore()
  const { selectedFolderId, selectedView } = useUIStore()
  const { labels, addLabel } = useLabelsStore()
  const { folders } = useFoldersStore()
  const { calendars, upsertEvent } = useCalendarStore()
  const { calendarEnabled, enabledCalendarIds } = usePrefsStore()

  // ── Form state ────────────────────────────────────────────────────────────

  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [creatingLabel, setCreatingLabel] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLOR_PRESETS[5])

  // ── Event mode state (H-03 / H-04) ───────────────────────────────────────

  const [formMode, setFormMode] = useState<'task' | 'event'>('task')
  const [eventStartDate, setEventStartDate] = useState('')
  const [eventStartTime, setEventStartTime] = useState('')
  const [eventEndTime, setEventEndTime] = useState('')
  const [eventCalendarId, setEventCalendarId] = useState('')
  const [eventStartDateError, setEventStartDateError] = useState(false)
  const [eventSubmitError, setEventSubmitError] = useState<string | null>(null)

  // Recurrence extras (event mode)
  const [weeklyDays, setWeeklyDays] = useState<string[]>([])
  const [monthlyByDay, setMonthlyByDay] = useState('')
  const [endsMode, setEndsMode] = useState<RRuleEnds>('NEVER')
  const [endsDate, setEndsDate] = useState('')
  const [endsCount, setEndsCount] = useState(1)

  // Edit recurring dialog
  const [showEditRecurDialog, setShowEditRecurDialog] = useState(false)

  const dateInputRef = useRef<HTMLInputElement>(null)
  const startTimeInputRef = useRef<HTMLInputElement>(null)
  const endTimeInputRef = useRef<HTMLInputElement>(null)

  // ── RHF setup ─────────────────────────────────────────────────────────────

  const defaultFolderId = () => {
    if (editing) return editing.folder_id
    if (selectedView === 'folder' && selectedFolderId) return selectedFolderId
    return INBOX_FOLDER_ID
  }

  const {
    register, control, handleSubmit, watch, reset, setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '', priority: 'normal', parent_id: parentId,
      folder_id: defaultFolderId(),
      labels: '',
      deadline_date: '', deadline_time: '',
      is_recurring: false, recur_type: 'days', recur_value: 1,
    },
  })

  // ── Watched values ─────────────────────────────────────────────────────────

  const isRecurring      = watch('is_recurring')
  const currentPriority  = watch('priority')
  const currentFolderId  = watch('folder_id')
  const deadlineDate     = watch('deadline_date')
  const deadlineTime     = watch('deadline_time')
  const currentRecurType  = watch('recur_type')
  const currentRecurValue = watch('recur_value')
  const currentLabels    = watch('labels').split(',').filter(Boolean)

  const selectedFolder = folders.find(f => f.id === currentFolderId)
  const isEditing      = Boolean(editing)
  const isEditingEvent = Boolean(editingEvent)

  // Enabled calendars available for picking
  const enabledCalendars = calendars.filter(c => enabledCalendarIds.includes(c.id))

  // ── Open / close effects ──────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      // Reset all local state when modal closes
      setCreatingLabel(false)
      setNewLabelName('')
      setShowFolderPicker(false)
      setShowLabelPicker(false)
      setFormMode('task')
      setEventStartDate('')
      setEventStartTime('')
      setEventEndTime('')
      setEventCalendarId('')
      setEventStartDateError(false)
      setEventSubmitError(null)
      setWeeklyDays([])
      setMonthlyByDay('')
      setEndsMode('NEVER')
      setEndsDate('')
      setEndsCount(1)
      setShowEditRecurDialog(false)
      return
    }

    if (editingEvent) {
      // EVENT editing mode
      setFormMode('event')
      setValue('title', editingEvent.title)
      setValue('is_recurring', false)
      setValue('recur_type', 'days')
      setValue('recur_value', 1)
      setEventStartDate(editingEvent.startDate)
      setEventStartTime(editingEvent.startTime)
      setEventEndTime(editingEvent.endTime)
      setEventCalendarId(editingEvent.calendarId)

      // Load recurrence info for recurring instances
      if (editingEvent.recurringEventId) {
        void (async () => {
          try {
            const dto = await getEvent(editingEvent.calendarId, editingEvent.recurringEventId!)
            const rruleStr = dto.recurrence?.[0]
            if (rruleStr) {
              const parsed = parseRRule(rruleStr)
              const freqToType: Record<RRuleFreq, string> = {
                DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years',
              }
              setValue('is_recurring', true)
              setValue('recur_type', (freqToType[parsed.freq] as FormValues['recur_type']) ?? 'days')
              setValue('recur_value', parsed.interval)
              setWeeklyDays(parsed.byDay)
              setMonthlyByDay(parsed.monthlyByDay)
              setEndsMode(parsed.ends)
              setEndsDate(parsed.endDate)
              setEndsCount(parsed.afterCount || 1)
            }
          } catch {
            // ignore — show form without recurrence pre-fill
          }
        })()
      }
    } else if (editing) {
      // TASK editing mode
      reset({
        title: editing.title,
        priority: editing.priority,
        parent_id: editing.parent_id,
        folder_id: editing.folder_id || INBOX_FOLDER_ID,
        labels: editing.labels,
        deadline_date: editing.deadline_date || '',
        deadline_time: editing.deadline_time,
        is_recurring: editing.is_recurring,
        recur_type: editing.recur_type || 'days',
        recur_value: editing.recur_value || 1,
      })
    } else {
      // New task / new event (show with task mode by default)
      reset({
        title: '', priority: 'normal', parent_id: parentId,
        folder_id: defaultFolderId(),
        labels: '',
        deadline_date: '', deadline_time: '',
        is_recurring: false, recur_type: 'days', recur_value: 1,
      })
      setFormMode('task')
      // Pre-select first enabled calendar for convenience
      if (enabledCalendars[0]) setEventCalendarId(enabledCalendars[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, editingEvent, parentId, reset])

  // ── Label helpers ─────────────────────────────────────────────────────────

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return
    const created = await addLabel({
      name: newLabelName.trim(),
      color: newLabelColor,
      sort_order: labels.length,
    })
    setValue('labels', [...currentLabels, created.id].join(','))
    setCreatingLabel(false)
    setNewLabelName('')
    setNewLabelColor(LABEL_COLOR_PRESETS[5])
  }

  const toggleLabel = (labelId: string) => {
    const next = currentLabels.includes(labelId)
      ? currentLabels.filter(l => l !== labelId)
      : [...currentLabels, labelId]
    setValue('labels', next.join(','))
  }

  // ── Clear + Postpone (A-04) ───────────────────────────────────────────────

  const handleClear = () => {
    setValue('deadline_date', '')
    setValue('deadline_time', '')
    setValue('is_recurring', false)
    setValue('recur_type', 'days')
    setValue('recur_value', 1)
  }

  const handlePostpone = () => {
    if (!deadlineDate) return
    const base = parseISO(deadlineDate)
    let next: Date
    switch (currentRecurType) {
      case 'days':   next = addDays(base, currentRecurValue); break
      case 'weeks':  next = addWeeks(base, currentRecurValue); break
      case 'months': next = addMonths(base, currentRecurValue); break
      case 'years':  next = addYears(base, currentRecurValue); break
      default: return
    }
    setValue('deadline_date', format(next, 'yyyy-MM-dd'))
  }

  // ── Event submit (H-04) ───────────────────────────────────────────────────

  const submitEvent = async (recurringChoice?: 'this' | 'all') => {
    const titleValue = watch('title').trim()
    if (!titleValue) return   // RHF will show the error

    if (!eventStartDate) {
      setEventStartDateError(true)
      return
    }
    if (!eventCalendarId) {
      setEventSubmitError('Please select a calendar')
      return
    }

    setEventStartDateError(false)
    setEventSubmitError(null)

    const start = buildEventDateTime(eventStartDate, eventStartTime)
    const end   = buildEndDateTime(eventStartDate, eventStartTime, eventEndTime)

    let recurrence: string[] | undefined
    if (isRecurring) {
      const freq = RECUR_TYPE_TO_FREQ[currentRecurType ?? 'days'] ?? 'DAILY'
      const rrule = buildRRule({
        freq,
        interval: currentRecurValue,
        byDay: freq === 'WEEKLY' ? weeklyDays : undefined,
        monthlyByDay: freq === 'MONTHLY' ? monthlyByDay : undefined,
        ends: endsMode,
        endDate: endsDate || undefined,
        afterCount: endsMode === 'AFTER_COUNT' ? endsCount : undefined,
      })
      recurrence = [rrule]
    }

    const body = {
      summary: titleValue,
      start,
      end,
      ...(recurrence ? { recurrence } : {}),
    }

    try {
      if (isEditingEvent) {
        const isRecurringInstance = editingEvent!.recurringEventId !== null
        if (isRecurringInstance && recurringChoice === undefined) {
          setShowEditRecurDialog(true)
          return
        }

        if (recurringChoice === 'this') {
          const dto = await updateEvent(editingEvent!.calendarId, editingEvent!.id, {
            ...body,
            recurrence: [],
          })
          upsertEvent(dtoToCalendarEvent(dto, editingEvent!.calendarId, editingEvent!.calendarName, editingEvent!.calendarColor))
        } else if (recurringChoice === 'all') {
          await updateEvent(editingEvent!.calendarId, editingEvent!.recurringEventId!, body)
          void pullCalendar()
        } else {
          // Non-recurring event edit
          const dto = await updateEvent(editingEvent!.calendarId, editingEvent!.id, body)
          upsertEvent(dtoToCalendarEvent(dto, editingEvent!.calendarId, editingEvent!.calendarName, editingEvent!.calendarColor))
        }
      } else {
        // Create new event
        const dto = await createEvent(eventCalendarId, body)
        const cal = enabledCalendars.find(c => c.id === eventCalendarId)
        if (cal) {
          upsertEvent(dtoToCalendarEvent(dto, eventCalendarId, cal.summary, cal.color))
        }
        if (isRecurring) {
          void pullCalendar()
        }
      }

      setShowEditRecurDialog(false)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setEventSubmitError(msg)
    }
  }

  // ── Task submit ───────────────────────────────────────────────────────────

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    if (formMode === 'event') {
      await submitEvent()
      return
    }

    const { title, folderId, labelsStr, priority } = parseSmartTitle(
      data.title,
      folders,
      labels,
      data.folder_id,
      data.labels.split(',').filter(Boolean),
      data.priority,
    )
    if (editing) {
      await updateTask(editing.id, {
        title,
        priority,
        parent_id: data.parent_id,
        labels: labelsStr,
        folder_id: folderId,
        deadline_date: data.deadline_date,
        deadline_time: data.deadline_time,
        is_recurring: data.is_recurring,
        recur_type: data.recur_type || '',
        recur_value: data.recur_value,
      })
    } else {
      await addTask({
        title,
        priority,
        folder_id: folderId,
        parent_id: data.parent_id,
        labels: labelsStr,
        deadline_date: data.deadline_date,
        deadline_time: data.deadline_time,
        is_recurring: data.is_recurring,
        recur_type: data.recur_type || '',
        recur_value: data.recur_value,
        status: 'pending',
        sort_order: 0,
      })
    }
    onClose()
  }

  // ── Deadline chip helpers (EVENT mode) ────────────────────────────────────

  const eventDateLabel = eventStartDate
    ? format(parseISO(eventStartDate), 'd MMM yyyy')
    : 'Date'

  // MONTHLY options (only when start date is set)
  const monthlyOpts = eventStartDate ? monthlyOptions(eventStartDate) : []

  // ── Render ────────────────────────────────────────────────────────────────

  const dialogTitle = isEditingEvent
    ? 'Edit event'
    : isEditing
    ? 'Edit task'
    : formMode === 'event'
    ? 'New event'
    : 'New task'

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          {/* ── Mode toggle: Task / Event (only when creating a new item) ── */}
          {!isEditing && !isEditingEvent && calendarEnabled && enabledCalendars.length > 0 && (
            <div className="flex rounded-lg border border-border overflow-hidden mb-2">
              <button
                type="button"
                className={cn(
                  'flex-1 py-1.5 text-sm font-medium transition-colors',
                  formMode === 'task' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setFormMode('task')}
              >
                Task
              </button>
              <button
                type="button"
                className={cn(
                  'flex-1 py-1.5 text-sm font-medium transition-colors border-l border-border',
                  formMode === 'event' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setFormMode('event')}
              >
                Event
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
            className="space-y-4"
          >
            {/* Title */}
            <div>
              <Input
                autoFocus
                placeholder={formMode === 'event' ? 'Event name' : 'Task name'}
                className="text-base"
                {...register('title')}
              />
              {errors.title && (
                <p className="text-sm text-destructive mt-1">{errors.title.message}</p>
              )}
            </div>

            {/* ── TASK mode fields ─────────────────────────────────────── */}
            {formMode === 'task' && (
              <>
                {/* Deadline + Time */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Due date</Label>
                    <Input type="date" {...register('deadline_date')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Time</Label>
                    <Input type="time" {...register('deadline_time')} />
                  </div>
                </div>

                {/* Repeat */}
                <div className="flex items-center gap-2">
                  <Controller
                    name="is_recurring"
                    control={control}
                    render={({ field }) => (
                      <Checkbox
                        id="recurring"
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />
                    )}
                  />
                  <label htmlFor="recurring" className="cursor-pointer text-sm text-foreground select-none">
                    Repeat
                  </label>
                  {isRecurring && (
                    <>
                      <span className="text-muted-foreground text-sm">every</span>
                      <Input
                        type="number" min={1} max={365}
                        className="w-16 h-8 text-sm"
                        {...register('recur_value', { valueAsNumber: true })}
                      />
                      <Controller
                        name="recur_type"
                        control={control}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="w-28 h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="days">days</SelectItem>
                              <SelectItem value="weeks">weeks</SelectItem>
                              <SelectItem value="months">months</SelectItem>
                              <SelectItem value="years">years</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </>
                  )}
                </div>

                {/* Folder chip */}
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-sm">Folder</Label>
                  <button
                    type="button"
                    onClick={() => setShowFolderPicker(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-border hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: `${selectedFolder?.color ?? '#6b7280'}2e` }}
                  >
                    <FolderIcon size={14} style={{ color: selectedFolder?.color ?? 'currentColor' }} />
                    <span>{selectedFolder?.name ?? 'Inbox'}</span>
                  </button>
                </div>

                {/* Labels row */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setShowLabelPicker(true)}
                    className="flex items-center justify-between w-full text-sm py-0.5"
                  >
                    <span className="text-muted-foreground">
                      Labels{currentLabels.length > 0 ? ` (${currentLabels.length})` : ''}
                    </span>
                    <span className="text-muted-foreground text-base leading-none">›</span>
                  </button>
                  {currentLabels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {currentLabels.map(id => {
                        const lbl = labels.find(l => l.id === id)
                        if (!lbl) return null
                        return (
                          <span
                            key={id}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border"
                            style={{ borderColor: lbl.color, color: lbl.color }}
                          >
                            <Tag size={10} />
                            {lbl.name}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleLabel(id) }}
                              className="hover:opacity-70 ml-0.5"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Priority chips */}
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-sm">Priority</Label>
                  <div className="flex gap-2">
                    {PRIORITY_OPTIONS.map(p => {
                      const selected = currentPriority === p.value
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setValue('priority', p.value)}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors flex-1 justify-center',
                            selected ? 'border-current' : 'border-border hover:bg-accent',
                          )}
                          style={selected ? { color: p.color, backgroundColor: `${p.color}2e` } : {}}
                        >
                          {selected
                            ? <Check size={14} style={{ color: p.color }} />
                            : <Flag size={14} style={{ color: p.color }} />
                          }
                          {p.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ── EVENT mode fields (H-03) ────────────────────────────── */}
            {formMode === 'event' && (
              <>
                {/* Date + start time — end time row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Date chip */}
                  <button
                    type="button"
                    onClick={() => dateInputRef.current?.showPicker()}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                      eventStartDateError
                        ? 'border-destructive text-destructive'
                        : eventStartDate
                        ? 'border-border bg-muted'
                        : 'border-dashed border-muted-foreground/50 text-muted-foreground hover:border-foreground',
                    )}
                  >
                    {eventStartDate
                      ? eventDateLabel
                      : <span>Date <span className="text-destructive">*</span></span>
                    }
                  </button>
                  <input
                    ref={dateInputRef}
                    type="date"
                    className="sr-only"
                    value={eventStartDate}
                    onChange={(e) => {
                      setEventStartDate(e.target.value)
                      setEventStartDateError(false)
                    }}
                  />

                  {/* Start time chip */}
                  <button
                    type="button"
                    onClick={() => startTimeInputRef.current?.showPicker()}
                    className="px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-accent transition-colors"
                  >
                    {eventStartTime || <span className="text-muted-foreground">HH:MM</span>}
                  </button>
                  <input
                    ref={startTimeInputRef}
                    type="time"
                    className="sr-only"
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                  />

                  <span className="text-muted-foreground">—</span>

                  {/* End time chip */}
                  <button
                    type="button"
                    onClick={() => endTimeInputRef.current?.showPicker()}
                    className="px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-accent transition-colors"
                  >
                    {eventEndTime || <span className="text-muted-foreground">HH:MM</span>}
                  </button>
                  <input
                    ref={endTimeInputRef}
                    type="time"
                    className="sr-only"
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                  />
                </div>
                {eventStartDateError && (
                  <p className="text-sm text-destructive -mt-2">Date is required</p>
                )}

                {/* Repeat row (always shown in event mode) */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Controller
                    name="is_recurring"
                    control={control}
                    render={({ field }) => (
                      <Checkbox
                        id="evt-recurring"
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />
                    )}
                  />
                  <label htmlFor="evt-recurring" className="cursor-pointer text-sm text-foreground select-none">
                    Repeat
                  </label>
                  {isRecurring && (
                    <>
                      <span className="text-muted-foreground text-sm">every</span>
                      <Input
                        type="number" min={1} max={365}
                        className="w-16 h-8 text-sm"
                        {...register('recur_value', { valueAsNumber: true })}
                      />
                      <Controller
                        name="recur_type"
                        control={control}
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={(v) => {
                              field.onChange(v)
                              // Seed weeklyDays when switching to weeks
                              if (v === 'weeks' && weeklyDays.length === 0 && eventStartDate) {
                                const jsDow = getDay(parseISO(eventStartDate))
                                setWeeklyDays([JS_DAY_TO_TOKEN[jsDow]])
                              }
                              // Reset monthly when switching away
                              if (v !== 'months') setMonthlyByDay('')
                            }}
                          >
                            <SelectTrigger className="w-28 h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="days">days</SelectItem>
                              <SelectItem value="weeks">weeks</SelectItem>
                              <SelectItem value="months">months</SelectItem>
                              <SelectItem value="years">years</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </>
                  )}
                </div>

                {/* Recurrence extras (H-03) */}
                {isRecurring && (
                  <div className="space-y-3 pl-1 border-l-2 border-muted ml-1">

                    {/* WEEKLY: day-of-week buttons */}
                    {currentRecurType === 'weeks' && (
                      <div className="flex gap-1 flex-wrap">
                        {WEEKDAY_TOKENS.map((token, i) => {
                          const active = weeklyDays.includes(token)
                          return (
                            <button
                              key={token}
                              type="button"
                              onClick={() =>
                                setWeeklyDays(prev =>
                                  prev.includes(token)
                                    ? prev.filter(d => d !== token)
                                    : [...prev, token],
                                )
                              }
                              className={cn(
                                'w-9 h-9 rounded-full text-xs font-medium border transition-colors',
                                active
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'border-border text-muted-foreground hover:border-foreground',
                              )}
                            >
                              {WEEKDAY_LABELS[i]}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* MONTHLY: option select */}
                    {currentRecurType === 'months' && monthlyOpts.length > 0 && (
                      <Select value={monthlyByDay} onValueChange={setMonthlyByDay}>
                        <SelectTrigger className="text-sm h-8">
                          <SelectValue placeholder="Monthly recurrence pattern" />
                        </SelectTrigger>
                        <SelectContent>
                          {monthlyOpts.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Ends: Never / On date / After N */}
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground font-medium">Ends</p>
                      <div className="space-y-1">
                        {(['NEVER', 'ON_DATE', 'AFTER_COUNT'] as const).map(mode => (
                          <label key={mode} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="radio"
                              name="endsMode"
                              checked={endsMode === mode}
                              onChange={() => setEndsMode(mode)}
                              className="accent-primary"
                            />
                            {mode === 'NEVER' && 'Never'}
                            {mode === 'ON_DATE' && (
                              <span className="flex items-center gap-2">
                                On date
                                {endsMode === 'ON_DATE' && (
                                  <Input
                                    type="date"
                                    className="h-7 text-xs w-36"
                                    value={endsDate}
                                    onChange={(e) => setEndsDate(e.target.value)}
                                  />
                                )}
                              </span>
                            )}
                            {mode === 'AFTER_COUNT' && (
                              <span className="flex items-center gap-2">
                                After
                                {endsMode === 'AFTER_COUNT' && (
                                  <Input
                                    type="number"
                                    min={1}
                                    max={999}
                                    className="h-7 text-xs w-16"
                                    value={endsCount}
                                    onChange={(e) => setEndsCount(Number(e.target.value))}
                                  />
                                )}
                                occurrences
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Calendar picker */}
                {enabledCalendars.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays size={14} />
                    <span>No calendars selected. Enable them in Settings → Calendars.</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-sm">Calendar</Label>
                    <Select value={eventCalendarId} onValueChange={setEventCalendarId}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Select calendar">
                          {(() => {
                            const cal = enabledCalendars.find(c => c.id === eventCalendarId)
                            return cal ? (
                              <span className="flex items-center gap-2">
                                <CalendarDays size={14} style={{ color: cal.color }} />
                                {cal.summary}
                              </span>
                            ) : null
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {enabledCalendars.map(cal => (
                          <SelectItem key={cal.id} value={cal.id}>
                            <span className="flex items-center gap-2">
                              <CalendarDays size={14} style={{ color: cal.color }} />
                              {cal.summary}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {eventSubmitError && (
                  <p className="text-sm text-destructive">{eventSubmitError}</p>
                )}
              </>
            )}

            {/* ── Buttons row ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between pt-1 pb-1">
              <div className="flex gap-1">
                {isEditing && formMode === 'task' && (deadlineDate || deadlineTime) && (
                  <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
                    Clear
                  </Button>
                )}
                {isEditing && formMode === 'task' && isRecurring && deadlineDate && (
                  <Button type="button" variant="ghost" size="sm" onClick={handlePostpone}>
                    Postpone
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="submit">
                  {isEditing || isEditingEvent ? 'Save' : 'Create'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Folder Picker Dialog (A-03) ──────────────────────────────────── */}
      <Dialog open={showFolderPicker} onOpenChange={(v) => !v && setShowFolderPicker(false)}>
        <DialogContent className="max-w-sm z-[60]">
          <DialogHeader>
            <DialogTitle>Select folder</DialogTitle>
          </DialogHeader>
          <ul className="space-y-0.5 max-h-64 overflow-y-auto">
            {folders.map(f => {
              const selected = currentFolderId === f.id
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left',
                      'hover:bg-muted/60 transition-colors',
                      selected && 'bg-muted/40',
                    )}
                    onClick={() => {
                      setValue('folder_id', f.id)
                      setShowFolderPicker(false)
                    }}
                  >
                    <FolderIcon size={15} style={{ color: f.color }} />
                    <span className="flex-1">{f.name}</span>
                    {selected && <Check size={14} className="text-primary flex-shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>

      {/* ── Label Picker Sheet (A-03) ─────────────────────────────────────── */}
      <Sheet
        open={showLabelPicker}
        onOpenChange={(v) => {
          if (!v) {
            setShowLabelPicker(false)
            setCreatingLabel(false)
            setNewLabelName('')
          }
        }}
      >
        <SheetContent side="bottom" className="max-h-[60vh] overflow-y-auto z-[60]">
          <SheetHeader>
            <SheetTitle>Labels</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            {labels.length > 0 && (
              <ul className="space-y-0.5">
                {labels.map(lbl => {
                  const selected = currentLabels.includes(lbl.id)
                  return (
                    <li key={lbl.id}>
                      <button
                        type="button"
                        onClick={() => toggleLabel(lbl.id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left',
                          'hover:bg-muted/60 transition-colors',
                          selected && 'bg-muted/40',
                        )}
                      >
                        <Tag size={14} style={{ color: lbl.color }} />
                        <span className="flex-1">{lbl.name}</span>
                        {selected && <Check size={14} className="text-primary flex-shrink-0" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {!creatingLabel ? (
              <button
                type="button"
                onClick={() => setCreatingLabel(true)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
              >
                <Plus size={14} />
                New label
              </button>
            ) : (
              <div className="space-y-2 px-1">
                <div className="flex gap-1 flex-wrap">
                  {LABEL_COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewLabelColor(c)}
                      className="w-5 h-5 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c,
                        borderColor: c === newLabelColor ? 'white' : 'transparent',
                      }}
                    />
                  ))}
                </div>
                <div className="flex gap-1">
                  <Input
                    autoFocus
                    className="h-8 text-sm"
                    placeholder="Label name"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); void handleCreateLabel() }
                      if (e.key === 'Escape') { setCreatingLabel(false); setNewLabelName('') }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateLabel()}
                    className="text-sm px-2.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreatingLabel(false); setNewLabelName('') }}
                    className="text-sm px-2 rounded border hover:bg-accent"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Edit recurring event dialog (H-04) ───────────────────────────── */}
      <EditRecurringDialog
        open={showEditRecurDialog}
        onEditThis={() => void submitEvent('this')}
        onEditAll={() => void submitEvent('all')}
        onCancel={() => setShowEditRecurDialog(false)}
      />
    </>
  )
}
