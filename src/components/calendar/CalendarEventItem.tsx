import { useState } from 'react'
import { CalendarDays, Clock, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { cn } from '@/lib/utils'
import { formatTaskDeadlineLabel, getDeadlineStatus } from '@/utils/dateUtils'
import type { CalendarEvent } from '@/types/calendarEvent'

// ── Time label helper ────────────────────────────────────────────────────────

/**
 * Build the time/date label for row 2.
 *
 * showDate=false (Upcoming / CalendarView): date is already in the group header,
 *   so we only show the time range.
 * showDate=true (AllTasksView): prepend a task-style date label so users can
 *   identify when the event is without a group header.
 */
function buildTimeLabel(event: CalendarEvent, showDate: boolean): string {
  if (!event.isAllDay) {
    if (showDate) {
      // Date prefix (Today / Tomorrow / weekday / d MMM) + time range
      const label = formatTaskDeadlineLabel(event.startDate, event.startTime)
      return event.endTime ? `${label} – ${event.endTime}` : label
    }
    // No date — just time range
    return event.endTime
      ? `${event.startTime} – ${event.endTime}`
      : event.startTime
  }

  // All-day event
  if (!showDate) return ''
  return formatTaskDeadlineLabel(event.startDate)  // Today / Tomorrow / weekday / d MMM
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

  // Apply the same color rules as task deadlines
  const status = getDeadlineStatus(event.startDate, event.isAllDay ? undefined : event.startTime)
  const timeColorClass =
    status === 'overdue'   ? 'text-red-400' :
    status === 'today'     ? 'text-green-600' :
    status === 'tomorrow'  ? 'text-orange-400' :
    status === 'week'      ? 'text-violet-400' :
    'text-muted-foreground'

  return (
    <>
      <div className="flex flex-col hover:bg-accent/40 border-b border-border/40 transition-colors">
        {/* Row 1 */}
        <div className="flex items-center gap-1.5 px-2 pt-2 pb-0.5">

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

          {/* Schedule button (clock icon) — same style as TaskItem action buttons */}
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
                <Pencil size={14} className="mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={14} className="mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Row 2: time label + calendar icon + calendar name */}
        <div className="flex items-center gap-2 pl-[52px] pr-2 pb-2 text-sm">
          {timeLabel && (
            <span className={cn('font-light', timeColorClass)}>{timeLabel}</span>
          )}
          <CalendarDays
            size={12}
            style={{ color: event.calendarColor }}
            className="flex-shrink-0"
          />
          <span className="truncate text-muted-foreground">{event.calendarName}</span>
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
