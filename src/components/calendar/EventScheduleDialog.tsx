import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { getEvent, updateEvent } from '@/api/calendarApi'
import { useCalendarStore } from '@/store/calendarStore'
import { pullCalendar } from '@/services/syncService'
import { buildEventDateTime, buildEndDateTime, parseEventDateTimeFromDto } from '@/utils/calendarDateTime'
import { buildRRule } from '@/utils/rrule'
import type { CalendarEvent } from '@/types/calendarEvent'
import type { RRuleFreq } from '@/utils/rrule'

// ── Recurring choice dialog ───────────────────────────────────────────────────

interface ChoiceDialogProps {
  open: boolean
  onThis: () => void
  onAll: () => void
  onCancel: () => void
}

function RecurringChoiceDialog({ open, onThis, onAll, onCancel }: ChoiceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm z-[70]">
        <DialogHeader>
          <DialogTitle>Edit recurring event?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start" onClick={onThis}>
            Edit this event only
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={onAll}>
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

// ── EventScheduleDialog ───────────────────────────────────────────────────────

export interface EventScheduleDialogProps {
  event: CalendarEvent
  open: boolean
  onClose: () => void
}

export function EventScheduleDialog({ event, open, onClose }: EventScheduleDialogProps) {
  const { upsertEvent } = useCalendarStore()
  const isRecurring = event.recurringEventId !== null

  const [startDate, setStartDate] = useState(event.startDate)
  const [startTime, setStartTime] = useState(event.startTime)
  const [endTime, setEndTime] = useState(event.endTime)
  const [isAllDay, setIsAllDay] = useState(event.isAllDay)
  // Repeat fields — only for non-recurring events
  const [addRepeat, setAddRepeat] = useState(false)
  const [repeatInterval, setRepeatInterval] = useState(1)
  const [repeatFreq, setRepeatFreq] = useState<RRuleFreq>('WEEKLY')

  const [submitting, setSubmitting] = useState(false)
  const [choiceOpen, setChoiceOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset local state whenever the dialog opens for a new event
  useEffect(() => {
    if (open) {
      setStartDate(event.startDate)
      setStartTime(event.startTime)
      setEndTime(event.endTime)
      setIsAllDay(event.isAllDay)
      setAddRepeat(false)
      setRepeatInterval(1)
      setRepeatFreq('WEEKLY')
      setSubmitting(false)
      setError(null)
    }
  }, [open, event])

  const handleSave = () => {
    if (!startDate) { setError('Date is required'); return }
    setError(null)
    if (isRecurring) {
      setChoiceOpen(true)
    } else {
      void doUpdate('this')
    }
  }

  const doUpdate = async (choice: 'this' | 'all') => {
    setSubmitting(true)
    setChoiceOpen(false)
    try {
      const evStartTime = isAllDay ? '' : startTime
      const evEndTime = isAllDay ? '' : endTime
      const startDt = buildEventDateTime(startDate, evStartTime)
      const endDt = buildEndDateTime(startDate, evStartTime, evEndTime)

      if (choice === 'all' && event.recurringEventId) {
        // Fetch the base series event so we preserve its summary + RRULE
        const baseDto = await getEvent(event.calendarId, event.recurringEventId)
        await updateEvent(event.calendarId, event.recurringEventId, {
          ...baseDto,
          start: startDt,
          end: endDt,
        })
        // Re-fetch all instances so the store reflects new times
        void pullCalendar()
      } else {
        const body: Record<string, unknown> = {
          summary: event.title,
          start: startDt,
          end: endDt,
        }
        if (!isRecurring && addRepeat) {
          body.recurrence = [buildRRule({
            freq: repeatFreq,
            interval: repeatInterval,
            ends: 'NEVER',
          })]
        }
        const dto = await updateEvent(event.calendarId, event.id, body)
        const parsed = parseEventDateTimeFromDto(dto)
        void upsertEvent({
          ...event,
          startDate: parsed.startDate,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          isAllDay: parsed.isAllDay,
        })
      }

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && !submitting && !choiceOpen && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit schedule</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* All-day toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="esd-allday"
                checked={isAllDay}
                onCheckedChange={(v) => {
                  setIsAllDay(v === true)
                  if (v) { setStartTime(''); setEndTime('') }
                }}
              />
              <label htmlFor="esd-allday" className="text-sm cursor-pointer select-none">
                All day
              </label>
            </div>

            {/* Date */}
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* Start + end times */}
            {!isAllDay && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Start time</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>End time</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Repeat — only for non-recurring events */}
            {!isRecurring && (
              <div className="flex items-center gap-2 flex-wrap">
                <Checkbox
                  id="esd-repeat"
                  checked={addRepeat}
                  onCheckedChange={(v) => setAddRepeat(v === true)}
                />
                <label htmlFor="esd-repeat" className="text-sm cursor-pointer select-none">
                  Repeat
                </label>
                {addRepeat && (
                  <>
                    <span className="text-muted-foreground text-sm">every</span>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      className="w-16 h-8 text-sm"
                      value={repeatInterval}
                      onChange={(e) => setRepeatInterval(Number(e.target.value))}
                    />
                    <Select
                      value={repeatFreq}
                      onValueChange={(v) => setRepeatFreq(v as RRuleFreq)}
                    >
                      <SelectTrigger className="w-28 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DAILY">days</SelectItem>
                        <SelectItem value="WEEKLY">weeks</SelectItem>
                        <SelectItem value="MONTHLY">months</SelectItem>
                        <SelectItem value="YEARLY">years</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            )}

            {/* Recurring badge */}
            {isRecurring && (
              <p className="text-sm text-muted-foreground">
                Recurring event — you can edit this occurrence or all events in the series.
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={submitting || !startDate}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shown on top of the main dialog when the event is recurring */}
      <RecurringChoiceDialog
        open={choiceOpen}
        onThis={() => void doUpdate('this')}
        onAll={() => void doUpdate('all')}
        onCancel={() => setChoiceOpen(false)}
      />
    </>
  )
}
