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
import { addDays, addWeeks, addMonths, addYears, format, parseISO } from 'date-fns'
import type { Task } from '@/types/task'

type RecurUnit = 'days' | 'weeks' | 'months' | 'years'

interface Props {
  open: boolean
  task: Task
  onClose: () => void
}

export function TimePickerDialog({ open, task, onClose }: Props) {
  const { updateTask } = useTasksStore()

  const [date, setDate]           = useState(task.deadline_date)
  const [time, setTime]           = useState(task.deadline_time)
  const [isRecurring, setIsRecurring] = useState(task.is_recurring)
  const [recurType, setRecurType] = useState<RecurUnit>(
    (task.recur_type as RecurUnit) || 'days',
  )
  const [recurValue, setRecurValue] = useState(task.recur_value || 1)

  useEffect(() => {
    if (open) {
      setDate(task.deadline_date)
      setTime(task.deadline_time)
      setIsRecurring(task.is_recurring)
      setRecurType((task.recur_type as RecurUnit) || 'days')
      setRecurValue(task.recur_value || 1)
    }
  }, [open, task])

  const handleSave = async () => {
    await updateTask(task.id, {
      deadline_date: date,
      deadline_time: date ? time : '',   // clear time when date is cleared
      is_recurring:  date ? isRecurring : false,
      recur_type:    date && isRecurring ? recurType : '',
      recur_value:   date && isRecurring ? recurValue : task.recur_value,
    })
    onClose()
  }

  // A-05: Clear clears BOTH date and time; visible when either is set
  const handleClearAll = async () => {
    await updateTask(task.id, {
      deadline_date: '', deadline_time: '',
      is_recurring: false, recur_type: '',
    })
    setDate('')
    setTime('')
    setIsRecurring(false)
    setRecurType('days')
    setRecurValue(1)
    onClose()
  }

  // A-05: Postpone uses LOCAL dialog state (not saved task state)
  const handlePostpone = async () => {
    if (!date || !isRecurring) return
    const base = parseISO(date)
    let next: Date
    switch (recurType) {
      case 'days':   next = addDays(base, recurValue); break
      case 'weeks':  next = addWeeks(base, recurValue); break
      case 'months': next = addMonths(base, recurValue); break
      case 'years':  next = addYears(base, recurValue); break
      default: return
    }
    await updateTask(task.id, { deadline_date: format(next, 'yyyy-MM-dd') })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set deadline</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date always shown */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {/* A-05: Time chip hidden when no date */}
            {date && (
              <div className="space-y-1">
                <Label>Time</Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            )}
          </div>

          {/* A-05: Repeat row hidden when no date */}
          {date && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="tp-recurring"
                checked={isRecurring}
                onCheckedChange={(v) => setIsRecurring(v === true)}
              />
              <label
                htmlFor="tp-recurring"
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
                    value={recurValue}
                    onChange={(e) => setRecurValue(Number(e.target.value))}
                  />
                  {/* A-01: 'years' option added */}
                  <Select
                    value={recurType}
                    onValueChange={(v) => setRecurType(v as RecurUnit)}
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
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-1">
            {/* A-05: Clear visible when date OR time is set */}
            {(date || time) && (
              <Button variant="ghost" size="sm" onClick={() => void handleClearAll()}>
                Clear
              </Button>
            )}
            {/* A-05: Postpone uses local isRecurring + date */}
            {isRecurring && date && (
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
