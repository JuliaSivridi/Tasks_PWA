import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

  useEffect(() => {
    if (open) {
      setDate(task.deadline_date)
      setTime(task.deadline_time)
    }
  }, [open, task.deadline_date, task.deadline_time])

  const handleSave = async () => {
    await updateTask(task.id, { deadline_date: date, deadline_time: time })
    onClose()
  }

  const handleClearAll = async () => {
    await updateTask(task.id, { deadline_date: '', deadline_time: '' })
    onClose()
  }

  const handlePostpone = async () => {
    const nextDate = getNextDueDate(task)
    if (nextDate) {
      await updateTask(task.id, { deadline_date: nextDate })
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set deadline</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Time (optional)</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
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
