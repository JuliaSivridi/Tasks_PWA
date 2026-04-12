import { useState, useEffect } from 'react'
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
import { getNextDueDate } from '@/services/recurrenceService'
import type { Task } from '@/types/task'

interface Props {
  open: boolean
  task: Task
  onClose: () => void
}

export function TimePickerDialog({ open, task, onClose }: Props) {
  const { updateTask } = useTasksStore()

  const [date, setDate] = useState(task.deadline_date)
  const [time, setTime] = useState(task.deadline_time)
  const [isRecurring, setIsRecurring] = useState(task.is_recurring)
  const [recurType, setRecurType] = useState<'days' | 'weeks' | 'months'>(
    (task.recur_type as 'days' | 'weeks' | 'months') || 'days',
  )
  const [recurValue, setRecurValue] = useState(task.recur_value || 1)

  useEffect(() => {
    if (open) {
      setDate(task.deadline_date)
      setTime(task.deadline_time)
      setIsRecurring(task.is_recurring)
      setRecurType((task.recur_type as 'days' | 'weeks' | 'months') || 'days')
      setRecurValue(task.recur_value || 1)
    }
  }, [open, task])

  const handleSave = async () => {
    await updateTask(task.id, {
      deadline_date: date,
      deadline_time: time,
      is_recurring: isRecurring,
      recur_type: isRecurring ? recurType : '',
      recur_value: isRecurring ? recurValue : task.recur_value,
    })
    onClose()
  }

  const handleClearAll = async () => {
    await updateTask(task.id, {
      deadline_date: '', deadline_time: '',
      is_recurring: false, recur_type: '',
    })
    setIsRecurring(false)
    setRecurType('days')
    setRecurValue(1)
    onClose()
  }

  const handlePostpone = async () => {
    const nextDate = getNextDueDate(task)
    if (nextDate) await updateTask(task.id, { deadline_date: nextDate })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set deadline</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {/* Recurrence */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="tp-recurring"
                checked={isRecurring}
                onCheckedChange={(v) => setIsRecurring(v === true)}
              />
              <Label htmlFor="tp-recurring" className="cursor-pointer">Recurring task</Label>
            </div>

            {isRecurring && (
              <div className="flex items-center gap-2 ml-6">
                <span className="text-muted-foreground text-sm">Every</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  className="w-16"
                  value={recurValue}
                  onChange={(e) => setRecurValue(Number(e.target.value))}
                />
                <Select
                  value={recurType}
                  onValueChange={(v) => setRecurType(v as 'days' | 'weeks' | 'months')}
                >
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">days</SelectItem>
                    <SelectItem value="weeks">weeks</SelectItem>
                    <SelectItem value="months">months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-1">
            {date && (
              <Button variant="ghost" size="sm" onClick={() => void handleClearAll()}>
                No date
              </Button>
            )}
            {task.is_recurring && task.deadline_date && (
              <Button variant="ghost" size="sm" onClick={() => void handlePostpone()}>
                Postpone
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void handleSave()}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
