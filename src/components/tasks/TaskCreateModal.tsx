import { useEffect, useState } from 'react'
import { useForm, Controller, type SubmitHandler } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Flag, Check, Tag, Plus, Folder as FolderIcon, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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
import { INBOX_FOLDER_ID, LABEL_COLOR_PRESETS } from '@/utils/constants'
import { cn } from '@/lib/utils'
import { parseSmartTitle } from '@/utils/smartTitle'
import { addDays, addWeeks, addMonths, addYears, format, parseISO } from 'date-fns'
import type { Task } from '@/types/task'

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

interface Props {
  open: boolean
  editing?: Task | null
  parentId?: string
  onClose: () => void
}

const PRIORITY_OPTIONS = [
  { value: 'urgent' as const,    label: 'Urgent',    color: '#f87171' },
  { value: 'important' as const, label: 'Important', color: '#fb923c' },
  { value: 'normal' as const,    label: 'Normal',    color: '#9ca3af' },
]

export function TaskCreateModal({ open, editing, parentId = '', onClose }: Props) {
  const { addTask, updateTask } = useTasksStore()
  const { selectedFolderId, selectedView } = useUIStore()
  const { labels, addLabel } = useLabelsStore()
  const { folders } = useFoldersStore()

  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [creatingLabel, setCreatingLabel] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLOR_PRESETS[5])

  const defaultFolderId = () => {
    if (editing) return editing.folder_id
    if (selectedView === 'folder' && selectedFolderId) return selectedFolderId
    return INBOX_FOLDER_ID
  }

  const { register, control, handleSubmit, watch, reset, setValue, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        title: '', priority: 'normal', parent_id: parentId,
        folder_id: defaultFolderId(),
        labels: '',
        deadline_date: '', deadline_time: '',
        is_recurring: false, recur_type: 'days', recur_value: 1,
      },
    })

  useEffect(() => {
    if (!open) {
      setCreatingLabel(false)
      setNewLabelName('')
      setShowFolderPicker(false)
      setShowLabelPicker(false)
      return
    }
    if (editing) {
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
      reset({
        title: '', priority: 'normal', parent_id: parentId,
        folder_id: defaultFolderId(),
        labels: '',
        deadline_date: '', deadline_time: '',
        is_recurring: false, recur_type: 'days', recur_value: 1,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, parentId, reset])

  const isRecurring    = watch('is_recurring')
  const currentPriority = watch('priority')
  const currentFolderId = watch('folder_id')
  const deadlineDate   = watch('deadline_date')
  const deadlineTime   = watch('deadline_time')
  const currentRecurType  = watch('recur_type')
  const currentRecurValue = watch('recur_value')
  const currentLabels  = watch('labels').split(',').filter(Boolean)

  const selectedFolder = folders.find(f => f.id === currentFolderId)
  const isEditing = Boolean(editing)

  // ── Label creation ─────────────────────────────────────────────────────────

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

  // ── Clear + Postpone (A-04) ────────────────────────────────────────────────

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

  // ── Submit ─────────────────────────────────────────────────────────────────

  const onSubmit = async (data: FormValues) => {
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit task' : 'New task'}</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => void handleSubmit(onSubmit as SubmitHandler<FormValues>)(e)}
            className="space-y-4"
          >
            {/* Title */}
            <div>
              <Input
                autoFocus
                placeholder="Task name"
                className="text-base"
                {...register('title')}
              />
              {errors.title && (
                <p className="text-sm text-destructive mt-1">{errors.title.message}</p>
              )}
            </div>

            {/* Deadline + Time (A-03 field order position 2) */}
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

            {/* Repeat (A-03 field order position 3; A-01 adds 'years') */}
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
              <label
                htmlFor="recurring"
                className="cursor-pointer text-sm text-foreground select-none"
              >
                Repeat
              </label>
              {isRecurring && (
                <>
                  <span className="text-muted-foreground text-sm">every</span>
                  <Input
                    type="number"
                    min={1}
                    max={365}
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

            {/* Folder chip → FolderPickerDialog (A-03 field order position 4) */}
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">Folder</Label>
              <button
                type="button"
                onClick={() => setShowFolderPicker(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-border hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: `${selectedFolder?.color ?? '#6b7280'}2e`,
                }}
              >
                <FolderIcon
                  size={14}
                  style={{ color: selectedFolder?.color ?? 'currentColor' }}
                />
                <span>{selectedFolder?.name ?? 'Inbox'}</span>
              </button>
            </div>

            {/* Labels row → LabelPickerSheet (A-03 field order position 5) */}
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

            {/* Priority chips (A-03 field order position 6; Flag→Check icon, color bg) */}
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
                      style={
                        selected
                          ? { color: p.color, backgroundColor: `${p.color}2e` }
                          : {}
                      }
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

            {/* Buttons row — Left: Clear/Postpone  Right: Cancel/Save (A-04) */}
            <div className="flex items-center justify-between pt-1 pb-1">
              <div className="flex gap-1">
                {isEditing && (deadlineDate || deadlineTime) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                  >
                    Clear
                  </Button>
                )}
                {isEditing && isRecurring && deadlineDate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handlePostpone}
                  >
                    Postpone
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit">{isEditing ? 'Save' : 'Create'}</Button>
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
            {/* Label list */}
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

            {/* New label */}
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
    </>
  )
}
