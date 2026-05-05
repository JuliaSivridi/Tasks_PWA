import { useState } from 'react'
import { CalendarDays, Clock, MoreHorizontal } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { cn } from '@/lib/utils'
import { isToday, isTomorrow, format, parseISO } from 'date-fns'
import type { CalendarEvent } from '@/types/calendarEvent'

// ── Time label helper ────────────────────────────────────────────────────────

function buildTimeLabel(event: CalendarEvent, showDate: boolean): string {
  if (!event.isAllDay) {
    // Timed event: "HH:MM – HH:MM" or "HH:MM"
    return event.endTime
      ? `${event.startTime} – ${event.endTime}`
      : event.startTime
  }
  // All-day event
  if (!showDate) return ''   // In Upcoming / Calendar views — nothing shown
  // In AllTasksView (showDate=true): Today / Tomorrow / d MMM
  const date = parseISO(event.startDate)
  if (isToday(date)) return 'Today'
  if (isTomorrow(date)) return 'Tomorrow'
  return format(date, 'd MMM')
}

// ── Delete dialog for recurring events ──────────────────────────────────────

interface RecurringDeleteDialogProps {
  open: boolean
  onDeleteThis: () => void
  onDeleteAll: () => void
  onCancel: () => void
}

function RecurringDeleteDialog({
  open, onDeleteThis, onDeleteAll, onCancel,
}: RecurringDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete recurring event?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onDeleteThis}
          >
            Delete this event only
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            onClick={onDeleteAll}
          >
            Delete all events in series
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── CalendarEventItem ────────────────────────────────────────────────────────

export interface CalendarEventItemProps {
  event: CalendarEvent
  /** Show date in the time label (true in AllTasksView, false in Upcoming/CalendarView) */
  showDate: boolean
  onEdit: () => void
  onEditSchedule: () => void
  onDelete: () => void
  onDeleteSeries: () => void
}

export function CalendarEventItem({
  event,
  showDate,
  onEdit,
  onEditSchedule,
  onDelete,
  onDeleteSeries,
}: CalendarEventItemProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isRecurring = event.recurringEventId !== null

  const timeLabel = buildTimeLabel(event, showDate)
  const hasSecondLine = timeLabel !== '' || true   // always show calendar name

  return (
    <>
      <div className="flex flex-col hover:bg-accent/40 border-b border-border/40 transition-colors">
        {/* Row 1 */}
        <div className={cn('flex items-center gap-1.5 px-2', hasSecondLine ? 'pt-2 pb-0.5' : 'py-2')}>

          {/* Expand spacer (mirrors TaskItem's expand slot) */}
          <span className="w-5 flex-shrink-0" />

          {/* Calendar icon in the checkbox slot */}
          <span className="flex-shrink-0 flex items-center justify-center w-5 h-5">
            <CalendarDays
              size={18}
              style={{ color: event.calendarColor }}
            />
          </span>

          {/* Title */}
          <span className="flex-1 text-base leading-snug">{event.title}</span>

          {/* Schedule button (clock icon) */}
          <button
            onClick={onEditSchedule}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            title="Edit schedule"
          >
            <Clock size={15} />
          </button>

          {/* More button → Edit / Delete */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                title="More options"
              >
                <MoreHorizontal size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Row 2: time label + calendar icon + calendar name */}
        <div className="flex items-center gap-2 pl-[52px] pr-2 pb-2 text-sm text-muted-foreground">
          {timeLabel && (
            <span className="font-light">{timeLabel}</span>
          )}
          <CalendarDays
            size={12}
            style={{ color: event.calendarColor }}
            className="flex-shrink-0"
          />
          <span className="truncate">{event.calendarName}</span>
        </div>
      </div>

      {/* Delete dialogs */}
      {isRecurring ? (
        <RecurringDeleteDialog
          open={deleteOpen}
          onDeleteThis={() => { setDeleteOpen(false); onDelete() }}
          onDeleteAll={() => { setDeleteOpen(false); onDeleteSeries() }}
          onCancel={() => setDeleteOpen(false)}
        />
      ) : (
        <ConfirmDialog
          open={deleteOpen}
          title="Delete event?"
          description="This event will be permanently deleted."
          confirmLabel="Delete"
          onConfirm={() => { setDeleteOpen(false); onDelete() }}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </>
  )
}
