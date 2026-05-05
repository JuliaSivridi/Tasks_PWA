/**
 * Focused schedule-editing dialog for calendar events.
 * Shows date chip, start/end time chips, and the full repeat section
 * (identical to the event mode in TaskCreateModal, minus title and calendar picker).
 */

import { useState, useEffect, useRef } from 'react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { getEvent, updateEvent } from '@/api/calendarApi'
import { useCalendarStore } from '@/store/calendarStore'
import { pullCalendar } from '@/services/syncService'
import { buildEventDateTime, buildEndDateTime, parseEventDateTimeFromDto } from '@/utils/calendarDateTime'
import { buildRRule, parseRRule, monthlyOptions } from '@/utils/rrule'
import { format, parseISO, getDay } from 'date-fns'
import type { CalendarEvent } from '@/types/calendarEvent'
import type { RRuleFreq, RRuleEnds } from '@/utils/rrule'

// ── Constants (mirror TaskCreateModal) ───────────────────────────────────────

type RecurType = 'days' | 'weeks' | 'months' | 'years'

const RECUR_TYPE_TO_FREQ: Record<RecurType, RRuleFreq> = {
  days: 'DAILY', weeks: 'WEEKLY', months: 'MONTHLY', years: 'YEARLY',
}
const FREQ_TO_RECUR_TYPE: Partial<Record<string, RecurType>> = {
  DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years',
}

const WEEKDAY_TOKENS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const JS_DAY_TO_TOKEN = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

// ── Recurring choice dialog ───────────────────────────────────────────────────

function RecurringChoiceDialog({
  open, onThis, onAll, onCancel,
}: {
  open: boolean
  onThis: () => void
  onAll: () => void
  onCancel: () => void
}) {
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
  const isRecurringInstance = event.recurringEventId !== null

  // Schedule fields
  const [startDate, setStartDate] = useState(event.startDate)
  const [startTime, setStartTime] = useState(event.startTime)
  const [endTime, setEndTime] = useState(event.endTime)

  // Repeat
  const [isRepeat, setIsRepeat] = useState(false)
  const [recurInterval, setRecurInterval] = useState(1)
  const [recurType, setRecurType] = useState<RecurType>('weeks')
  const [weeklyDays, setWeeklyDays] = useState<string[]>([])
  const [monthlyByDay, setMonthlyByDay] = useState('BY_MONTH_DAY')
  const [endsMode, setEndsMode] = useState<RRuleEnds>('NEVER')
  const [endsDate, setEndsDate] = useState('')
  const [endsCount, setEndsCount] = useState(1)

  // UI state
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [choiceOpen, setChoiceOpen] = useState(false)
  const [startDateError, setStartDateError] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dateInputRef = useRef<HTMLInputElement>(null)
  const startTimeInputRef = useRef<HTMLInputElement>(null)
  const endTimeInputRef = useRef<HTMLInputElement>(null)

  // ── Reset + RRULE load when dialog opens ───────────────────────────────────

  useEffect(() => {
    if (!open) return

    setStartDate(event.startDate)
    setStartTime(event.startTime)
    setEndTime(event.endTime)
    setIsRepeat(isRecurringInstance)
    setRecurInterval(1)
    setRecurType('weeks')
    setWeeklyDays([])
    setMonthlyByDay('BY_MONTH_DAY')
    setEndsMode('NEVER')
    setEndsDate('')
    setEndsCount(1)
    setSubmitting(false)
    setChoiceOpen(false)
    setStartDateError(false)
    setError(null)

    // Load the actual RRULE for recurring instances
    if (isRecurringInstance && event.recurringEventId) {
      setLoading(true)
      void (async () => {
        try {
          const dto = await getEvent(event.calendarId, event.recurringEventId!)
          const rruleStr = dto.recurrence?.[0]
          if (rruleStr) {
            const parsed = parseRRule(rruleStr)
            setRecurInterval(parsed.interval)
            setRecurType(FREQ_TO_RECUR_TYPE[parsed.freq] ?? 'weeks')
            setWeeklyDays(parsed.byDay)
            setMonthlyByDay(parsed.monthlyByDay || 'BY_MONTH_DAY')
            setEndsMode(parsed.ends)
            setEndsDate(parsed.endDate)
            setEndsCount(parsed.afterCount || 1)
          }
        } catch {
          // ignore — form works without pre-filled recurrence
        } finally {
          setLoading(false)
        }
      })()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const eventDateLabel = startDate
    ? format(parseISO(startDate), 'd MMM yyyy')
    : null

  const monthlyOpts = startDate ? monthlyOptions(startDate) : []

  const buildRRuleStr = (): string => {
    const freq = RECUR_TYPE_TO_FREQ[recurType]
    return buildRRule({
      freq,
      interval: recurInterval,
      byDay: freq === 'WEEKLY' ? weeklyDays : undefined,
      monthlyByDay: freq === 'MONTHLY' ? monthlyByDay : undefined,
      ends: endsMode,
      endDate: endsDate || undefined,
      afterCount: endsMode === 'AFTER_COUNT' ? endsCount : undefined,
    })
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = () => {
    if (!startDate) { setStartDateError(true); return }
    setStartDateError(false)
    setError(null)
    if (isRecurringInstance) {
      setChoiceOpen(true)
    } else {
      void doUpdate('this')
    }
  }

  const doUpdate = async (choice: 'this' | 'all') => {
    setSubmitting(true)
    setChoiceOpen(false)
    try {
      const startDt = buildEventDateTime(startDate, startTime)
      const endDt   = buildEndDateTime(startDate, startTime, endTime)

      if (choice === 'all' && event.recurringEventId) {
        // Fetch base event to preserve summary and other fields
        const baseDto = await getEvent(event.calendarId, event.recurringEventId)
        await updateEvent(event.calendarId, event.recurringEventId, {
          ...baseDto,
          start: startDt,
          end: endDt,
          recurrence: isRepeat ? [buildRRuleStr()] : [],
        })
        void pullCalendar()
      } else {
        // 'this' or non-recurring
        const body: Record<string, unknown> = {
          summary: event.title,
          start: startDt,
          end: endDt,
        }
        if (isRecurringInstance) {
          // Break this occurrence out of the series
          body.recurrence = []
        } else if (isRepeat) {
          body.recurrence = [buildRRuleStr()]
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => !v && !submitting && !choiceOpen && onClose()}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit schedule</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Date chip + start time chip + — + end time chip */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => dateInputRef.current?.showPicker()}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                  startDateError
                    ? 'border-destructive text-destructive'
                    : startDate
                    ? 'border-border bg-muted'
                    : 'border-dashed border-muted-foreground/50 text-muted-foreground hover:border-foreground',
                )}
              >
                {eventDateLabel ?? <span>Date <span className="text-destructive">*</span></span>}
              </button>
              <input
                ref={dateInputRef}
                type="date"
                className="sr-only"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setStartDateError(false) }}
              />

              <button
                type="button"
                onClick={() => startTimeInputRef.current?.showPicker()}
                className="px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-accent transition-colors"
              >
                {startTime || <span className="text-muted-foreground">HH:MM</span>}
              </button>
              <input
                ref={startTimeInputRef}
                type="time"
                className="sr-only"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />

              <span className="text-muted-foreground">—</span>

              <button
                type="button"
                onClick={() => endTimeInputRef.current?.showPicker()}
                className="px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-accent transition-colors"
              >
                {endTime || <span className="text-muted-foreground">HH:MM</span>}
              </button>
              <input
                ref={endTimeInputRef}
                type="time"
                className="sr-only"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            {startDateError && (
              <p className="text-sm text-destructive -mt-2">Date is required</p>
            )}

            {/* Repeat row */}
            <div className="flex items-center gap-2 flex-wrap">
              <Checkbox
                id="esd-repeat"
                checked={isRepeat}
                disabled={loading}
                onCheckedChange={(v) => {
                  const checked = v === true
                  setIsRepeat(checked)
                  if (checked && recurType === 'weeks' && weeklyDays.length === 0 && startDate) {
                    setWeeklyDays([JS_DAY_TO_TOKEN[getDay(parseISO(startDate))]])
                  }
                }}
              />
              <label htmlFor="esd-repeat" className="cursor-pointer text-sm select-none">
                {loading ? 'Loading…' : 'Repeat'}
              </label>
              {isRepeat && !loading && (
                <>
                  <span className="text-muted-foreground text-sm">every</span>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    className="w-16 h-8 text-sm"
                    value={recurInterval}
                    onChange={(e) => setRecurInterval(Number(e.target.value))}
                  />
                  <Select
                    value={recurType}
                    onValueChange={(v) => {
                      const t = v as RecurType
                      setRecurType(t)
                      if (t === 'weeks' && weeklyDays.length === 0 && startDate) {
                        setWeeklyDays([JS_DAY_TO_TOKEN[getDay(parseISO(startDate))]])
                      }
                      if (t !== 'months') setMonthlyByDay('BY_MONTH_DAY')
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
                </>
              )}
            </div>

            {/* Recurrence extras — mirror of TaskCreateModal event mode */}
            {isRepeat && !loading && (
              <div className="space-y-3 pl-1 border-l-2 border-muted ml-1">

                {/* WEEKLY: day-of-week toggle buttons */}
                {recurType === 'weeks' && (
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

                {/* MONTHLY: recurrence pattern select */}
                {recurType === 'months' && monthlyOpts.length > 0 && (
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

                {/* Ends: Never / On date / After N occurrences */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Ends</p>
                  <div className="space-y-1">
                    {(['NEVER', 'ON_DATE', 'AFTER_COUNT'] as const).map(mode => (
                      <label key={mode} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="esd-ends"
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
                            {' '}occurrences
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={submitting || loading || !startDate}
            >
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecurringChoiceDialog
        open={choiceOpen}
        onThis={() => void doUpdate('this')}
        onAll={() => void doUpdate('all')}
        onCancel={() => setChoiceOpen(false)}
      />
    </>
  )
}
