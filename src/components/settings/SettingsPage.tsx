import { useState } from 'react'
import { Check, Table2, Loader2, CalendarDays, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { usePrefsStore } from '@/store/prefsStore'
import { useCalendarStore } from '@/store/calendarStore'
import { listUserSheets } from '@/api/driveApi'
import { listCalendars } from '@/api/calendarApi'
import { initialLoad, pullCalendar } from '@/services/syncService'
import { invalidateRowCache } from '@/api/sheetsClient'
import { db } from '@/services/db'
import { cn } from '@/lib/utils'

// ── Inline toggle switch (no external dep) ───────────────────────────────────
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-md transition-transform duration-200 mt-0.5',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

export function SettingsPage() {
  const { setSettingsOpen } = useUIStore()
  const { spreadsheetId, spreadsheetName, setSpreadsheet, refreshToken } = useAuthStore()
  const {
    calendarEnabled, enabledCalendarIds,
    setCalendarEnabled, setEnabledCalendarIds,
  } = usePrefsStore()
  const { calendars, setCalendars } = useCalendarStore()

  // ── Spreadsheet picker state ─────────────────────────────────────────────
  const [pickerOpen, setPickerOpen]       = useState(false)
  const [pickerFiles, setPickerFiles]     = useState<{ id: string; name: string }[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [switching, setSwitching]         = useState(false)

  // ── Calendar section state ───────────────────────────────────────────────
  const [calLoading, setCalLoading]   = useState(false)
  const [calError, setCalError]       = useState<string | null>(null)
  const [calRefreshing, setCalRefreshing] = useState(false)

  // ── Spreadsheet handlers ─────────────────────────────────────────────────

  async function handleOpenPicker() {
    if (pickerOpen) { setPickerOpen(false); return }
    setPickerOpen(true)
    setPickerLoading(true)
    try {
      const files = await listUserSheets()
      setPickerFiles(files)
    } catch {
      setPickerOpen(false)
    } finally {
      setPickerLoading(false)
    }
  }

  async function handlePickFile(file: { id: string; name: string }) {
    setPickerOpen(false)
    if (file.id === spreadsheetId) return
    setSwitching(true)
    try {
      setSpreadsheet(file.id, file.name)
      await Promise.all([
        db.tasks.clear(),
        db.folders.clear(),
        db.labels.clear(),
        db.queue.clear(),
      ])
      invalidateRowCache()
      setSettingsOpen(false)
      await initialLoad()
    } finally {
      setSwitching(false)
    }
  }

  // ── Calendar handlers ────────────────────────────────────────────────────

  async function fetchCalendarList() {
    setCalError(null)
    try {
      const cals = await listCalendars()
      setCalendars(cals)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('403')) {
        setCalError('403')
      } else {
        setCalError(msg)
      }
    }
  }

  async function handleCalendarToggle(enabled: boolean) {
    setCalendarEnabled(enabled)
    if (enabled) {
      setCalLoading(true)
      await fetchCalendarList()
      setCalLoading(false)
      void pullCalendar()
    }
  }

  async function handleRefreshCalendars() {
    setCalRefreshing(true)
    await fetchCalendarList()
    setCalRefreshing(false)
    void pullCalendar()
  }

  async function handleGrantAccess() {
    try {
      await refreshToken()
      setCalError(null)
      setCalLoading(true)
      await fetchCalendarList()
      setCalLoading(false)
      void pullCalendar()
    } catch {
      setCalError('Failed to grant access. Please try again.')
    }
  }

  function toggleCalendarId(id: string) {
    const updated = enabledCalendarIds.includes(id)
      ? enabledCalendarIds.filter(c => c !== id)
      : [...enabledCalendarIds, id]
    setEnabledCalendarIds(updated)
    void pullCalendar()
  }

  const displayName = spreadsheetName || spreadsheetId || '—'

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

          {/* ── Spreadsheet section ──────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
              Spreadsheet
            </p>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <Table2 size={18} className="text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Google Sheets data source</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0 text-xs h-7 px-3"
                  onClick={() => void handleOpenPicker()}
                  disabled={switching}
                  aria-expanded={pickerOpen}
                >
                  {switching ? (
                    <><Loader2 size={12} className="animate-spin mr-1" />Switching…</>
                  ) : pickerOpen ? 'Cancel' : 'Change'}
                </Button>
              </div>

              {pickerOpen && (
                <div className="border-t border-border">
                  {pickerLoading ? (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      Loading your sheets…
                    </div>
                  ) : pickerFiles.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      No Google Sheets found in your Drive.
                    </p>
                  ) : (
                    <ul className="max-h-60 overflow-y-auto">
                      {pickerFiles.map((file) => (
                        <li key={file.id}>
                          <button
                            className={cn(
                              'w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left',
                              'hover:bg-muted/60 transition-colors',
                              file.id === spreadsheetId && 'bg-muted/40',
                            )}
                            onClick={() => void handlePickFile(file)}
                          >
                            <span className="flex-1 truncate">{file.name}</span>
                            {file.id === spreadsheetId && (
                              <Check size={14} className="text-primary flex-shrink-0" />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Calendars section ────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Calendars
              </p>
              {calendarEnabled && (
                <button
                  type="button"
                  onClick={() => void handleRefreshCalendars()}
                  disabled={calRefreshing}
                  className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  aria-label="Refresh calendar list"
                >
                  <RefreshCw size={13} className={cn(calRefreshing && 'animate-spin')} />
                </button>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {/* Toggle row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <CalendarDays size={18} className="text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Show Google Calendar events</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Merge events with your tasks
                  </p>
                </div>
                {calLoading
                  ? <Loader2 size={16} className="animate-spin text-muted-foreground flex-shrink-0" />
                  : (
                    <ToggleSwitch
                      checked={calendarEnabled}
                      onChange={(v) => void handleCalendarToggle(v)}
                    />
                  )
                }
              </div>

              {/* Error state */}
              {calendarEnabled && calError && (
                <div className="border-t border-border px-4 py-3">
                  {calError === '403' ? (
                    <div className="space-y-2">
                      <p className="text-sm text-destructive">
                        Additional Google Calendar permission required.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => void handleGrantAccess()}
                      >
                        Grant access
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-destructive">{calError}</p>
                  )}
                </div>
              )}

              {/* Calendar list */}
              {calendarEnabled && !calError && calendars.length > 0 && (
                <div className="border-t border-border">
                  <ul>
                    {calendars.map(cal => {
                      const enabled = enabledCalendarIds.includes(cal.id)
                      return (
                        <li key={cal.id}>
                          <button
                            className={cn(
                              'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left',
                              'hover:bg-muted/60 transition-colors',
                              enabled && 'bg-muted/30',
                            )}
                            onClick={() => toggleCalendarId(cal.id)}
                          >
                            <CalendarDays
                              size={16}
                              style={{ color: cal.color }}
                              className="flex-shrink-0"
                            />
                            <span className="flex-1 truncate">{cal.summary}</span>
                            {enabled && (
                              <Check size={14} className="text-primary flex-shrink-0" />
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* Empty state when enabled but no calendars */}
              {calendarEnabled && !calError && !calLoading && calendars.length === 0 && (
                <div className="border-t border-border px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    No calendars found. Try refreshing.
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
