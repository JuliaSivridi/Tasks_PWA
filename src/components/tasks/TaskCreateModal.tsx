import { useEffect, useState } from 'react'
import { useForm, Controller, type SubmitHandler } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Flag, Tag, Plus, Folder } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
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
  recur_type:    z.enum(['days', 'weeks', 'months', '']),
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
    if (!open) { setCreatingLabel(false); setNewLabelName('') }
    if (!open) return
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

  const isRecurring = watch('is_recurring')
  const currentPriority = watch('priority')
  const currentLabels = watch('labels').split(',').filter(Boolean)

  // Parse @FolderName and #LabelName tokens from the title.
  const parseTitle = (raw: string, baseLabelIds: string[], baseFolderId: string) => {
    let title = raw
    let folderId = baseFolderId

    title = title.replace(/@(\S+)/g, (match, name: string) => {
      const found = folders.find(f => f.name.toLowerCase() === name.toLowerCase())
      if (found) { folderId = found.id; return '' }
      return match
    })

    const extraLabels = new Set(baseLabelIds)
    title = title.replace(/#(\S+)/g, (match, name: string) => {
      const found = labels.find(l => l.name.toLowerCase() === name.toLowerCase())
      if (found) { extraLabels.add(found.id); return '' }
      return match
    })

    return {
      title: title.replace(/\s{2,}/g, ' ').trim(),
      folderId,
      labelsStr: Array.from(extraLabels).join(','),
    }
  }

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return
    const created = await addLabel({ name: newLabelName.trim(), color: newLabelColor, sort_order: labels.length })
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

  const onSubmit = async (data: FormValues) => {
    const { title, folderId, labelsStr } = parseTitle(
      data.title,
      data.labels.split(',').filter(Boolean),
      data.folder_id,
    )
    if (editing) {
      await updateTask(editing.id, {
        title,
        priority: data.priority,
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
        priority: data.priority,
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

  const selectedFolder = folders.find(f => f.id === watch('folder_id'))

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit task' : 'New task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(onSubmit as SubmitHandler<FormValues>)(e)} className="space-y-4">

          {/* Title */}
          <div>
            <Input
              autoFocus
              placeholder="Task name"
              className="text-base"
              {...register('title')}
            />
            {errors.title && <p className="text-sm text-destructive mt-1">{errors.title.message}</p>}
          </div>

          {/* Deadline */}
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

          {/* Recurrence — inline: [ ] Repeat  every [N] [type] */}
          <div className="flex items-center gap-2">
            <Controller name="is_recurring" control={control} render={({ field }) => (
              <Checkbox
                id="recurring"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
              />
            )} />
            <label htmlFor="recurring" className="cursor-pointer text-sm text-foreground select-none">Repeat</label>
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
                <Controller name="recur_type" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="days">days</SelectItem>
                      <SelectItem value="weeks">weeks</SelectItem>
                      <SelectItem value="months">months</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </>
            )}
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Priority</Label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setValue('priority', p.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-sm transition-colors flex-1 justify-center',
                    currentPriority === p.value
                      ? 'border-current bg-accent'
                      : 'border-border hover:bg-accent',
                  )}
                  style={currentPriority === p.value ? { color: p.color } : {}}
                >
                  <Flag size={14} style={{ color: p.color }} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Labels */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-sm">Labels</Label>
              {!creatingLabel && (
                <button
                  type="button"
                  onClick={() => setCreatingLabel(true)}
                  className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus size={12} /> New
                </button>
              )}
            </div>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {labels.map(label => {
                  const selected = currentLabels.includes(label.id)
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => toggleLabel(label.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-sm transition-colors',
                        selected ? 'bg-accent' : 'border-border hover:bg-accent',
                      )}
                      style={selected ? { borderColor: label.color } : {}}
                    >
                      <Tag size={12} style={{ color: label.color }} />
                      <span style={selected ? { color: label.color } : {}}>{label.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {creatingLabel && (
              <div className="space-y-1.5">
                <div className="flex gap-1 flex-wrap">
                  {LABEL_COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewLabelColor(c)}
                      className="w-4 h-4 rounded-full border-2 transition-all"
                      style={{ backgroundColor: c, borderColor: c === newLabelColor ? 'white' : 'transparent' }}
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

          {/* Folder */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Folder</Label>
            <Controller name="folder_id" control={control} render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <Folder size={14} style={{ color: selectedFolder?.color ?? 'currentColor' }} />
                      {selectedFolder?.name ?? 'Inbox'}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {folders.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      <span className="flex items-center gap-2">
                        <Folder size={14} style={{ color: f.color }} />
                        {f.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )} />
          </div>

          <div className="flex justify-end gap-2 pt-1 pb-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{editing ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
