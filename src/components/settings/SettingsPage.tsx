import { useEffect, useState } from 'react'
import {
  Check, Table2, Loader2, CalendarDays, RefreshCw,
  Tag, Folder as FolderIcon, Inbox, Pencil, Trash2, Plus, Flag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { usePrefsStore } from '@/store/prefsStore'
import { useCalendarStore } from '@/store/calendarStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useLabelsStore } from '@/store/labelsStore'
import { useTasksStore } from '@/store/tasksStore'
import { listUserSheets } from '@/api/driveApi'
import { listCalendars } from '@/api/calendarApi'
import { initialLoad, pullCalendar } from '@/services/syncService'
import { invalidateRowCache } from '@/api/sheetsClient'
import { db } from '@/services/db'
import { cn } from '@/lib/utils'
import { INBOX_FOLDER_ID, LABEL_COLOR_PRESETS } from '@/utils/constants'

// ── Inline toggle switch ──────────────────────────────────────────────────────

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

// ── Item form modal (shared for Folders and Labels) ───────────────────────────

function ItemFormModal({
  open, title, initialName = '', initialColor = LABEL_COLOR_PRESETS[1],
  onSave, onCancel,
}: {
  open: boolean
  title: string
  initialName?: string
  initialColor?: string
  onSave: (name: string, color: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)

  useEffect(() => {
    if (open) { setName(initialName); setColor(initialColor) }
  }, [open, initialName, initialColor])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <Input
            autoFocus
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onSave(name.trim(), color)
            }}
          />
          <div className="flex gap-2 flex-wrap">
            {LABEL_COLOR_PRESETS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full border-2 transition-all"
                style={{ backgroundColor: c, borderColor: c === color ? 'white' : 'transparent' }}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button onClick={() => name.trim() && onSave(name.trim(), color)} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── SettingsPage ──────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { setSettingsOpen } = useUIStore()
  const { spreadsheetId, spreadsheetName, setSpreadsheet, refreshToken } = useAuthStore()
  const {
    calendarEnabled, enabledCalendarIds,
    setCalendarEnabled, setEnabledCalendarIds,
    prioritiesEnabled, labelsEnabled, foldersEnabled,
    setPrioritiesEnabled, setLabelsEnabled, setFoldersEnabled,
  } = usePrefsStore()
  const { calendars, setCalendars } = useCalendarStore()
  const { folders, addFolder, updateFolder, deleteFolder } = useFoldersStore()
  const { labels, addLabel, updateLabel, deleteLabel } = useLabelsStore()
  const { moveTasksToFolder, stripLabelFromTasks } = useTasksStore()

  // ── Spreadsheet picker state ─────────────────────────────────────────────
  const [pickerOpen, setPickerOpen]       = useState(false)
  const [pickerFiles, setPickerFiles]     = useState<{ id: string; name: string }[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [switching, setSwitching]         = useState(false)

  // ── Calendar section state ───────────────────────────────────────────────
  const [calLoading, setCalLoading]       = useState(false)
  const [calError, setCalError]           = useState<string | null>(null)
  const [calRefreshing, setCalRefreshing] = useState(false)

  // ── Labels CRUD state ────────────────────────────────────────────────────
  const [creatingLabel, setCreatingLabel]   = useState(false)
  const [editingLabel, setEditingLabel]     = useState<{ id: string; name: string; color: string } | null>(null)
  const [deletingLabelId, setDeletingLabelId] = useState<string | null>(null)

  // ── Folders CRUD state ───────────────────────────────────────────────────
  const [creatingFolder, setCreatingFolder]   = useState(false)
  const [editingFolder, setEditingFolder]     = useState<{ id: string; name: string; color: string } | null>(null)
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)

  const sortedFolders = [...folders].sort((a, b) => a.sort_order - b.sort_order)
  const deletingLabel = labels.find(l => l.id === deletingLabelId)
  const deletingFolder = folders.find(f => f.id === deletingFolderId)

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
      setCalError(msg.includes('403') ? '403' : msg)
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
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

          {/* ── 1. Spreadsheet ──────────────────────────────────────────────── */}
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

          {/* ── 2. Priorities ───────────────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Flag size={18} className="text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Priorities</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Mark tasks as Urgent, Important, or Normal
                </p>
              </div>
              <ToggleSwitch checked={prioritiesEnabled} onChange={setPrioritiesEnabled} />
            </div>
          </div>

          {/* ── 3. Labels ───────────────────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Header row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <Tag size={18} className="text-muted-foreground flex-shrink-0" />
              <p className="text-sm font-medium flex-1">Labels</p>
              <ToggleSwitch checked={labelsEnabled} onChange={setLabelsEnabled} />
              {labelsEnabled && (
                <button
                  type="button"
                  onClick={() => setCreatingLabel(true)}
                  className="ml-1 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title="Add label"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            {/* Label list */}
            {labelsEnabled && (
              <div className="border-t border-border">
                {labels.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    No labels yet. Tap + to add one.
                  </p>
                ) : (
                  <ul>
                    {labels.map(label => (
                      <li key={label.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="flex-1 text-sm truncate">{label.name}</span>
                        <button
                          onClick={() => setEditingLabel({ id: label.id, name: label.name, color: label.color })}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeletingLabelId(label.id)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* ── 4. Folders ──────────────────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Header row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <FolderIcon size={18} className="text-muted-foreground flex-shrink-0" />
              <p className="text-sm font-medium flex-1">Folders</p>
              <ToggleSwitch checked={foldersEnabled} onChange={setFoldersEnabled} />
              {foldersEnabled && (
                <button
                  type="button"
                  onClick={() => setCreatingFolder(true)}
                  className="ml-1 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title="Add folder"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            {/* Folder list */}
            {foldersEnabled && (
              <div className="border-t border-border">
                {/* Inbox first — no edit/delete */}
                {(() => {
                  const inbox = folders.find(f => f.id === INBOX_FOLDER_ID)
                  if (!inbox) return null
                  return (
                    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
                      <Inbox size={14} className="text-primary flex-shrink-0" />
                      <span className="flex-1 text-sm truncate text-muted-foreground">Inbox</span>
                    </div>
                  )
                })()}

                {sortedFolders.filter(f => f.id !== INBOX_FOLDER_ID).length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    No folders yet. Tap + to add one.
                  </p>
                ) : (
                  <ul>
                    {sortedFolders.filter(f => f.id !== INBOX_FOLDER_ID).map(folder => (
                      <li key={folder.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: folder.color }}
                        />
                        <span className="flex-1 text-sm truncate">{folder.name}</span>
                        <button
                          onClick={() => setEditingFolder({ id: folder.id, name: folder.name, color: folder.color })}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeletingFolderId(folder.id)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* ── 5. Calendars ────────────────────────────────────────────────── */}
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
              {calendarEnabled && (
                <button
                  type="button"
                  onClick={() => void handleRefreshCalendars()}
                  disabled={calRefreshing}
                  className="ml-1 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  aria-label="Refresh calendar list"
                >
                  <RefreshCw size={14} className={cn(calRefreshing && 'animate-spin')} />
                </button>
              )}
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

            {/* Empty state */}
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

      {/* ── Label modals ──────────────────────────────────────────────────────── */}
      <ItemFormModal
        open={creatingLabel}
        title="New label"
        onSave={async (name, color) => {
          await addLabel({ name, color, sort_order: labels.length })
          setCreatingLabel(false)
        }}
        onCancel={() => setCreatingLabel(false)}
      />
      <ItemFormModal
        open={editingLabel !== null}
        title="Edit label"
        initialName={editingLabel?.name}
        initialColor={editingLabel?.color}
        onSave={async (name, color) => {
          if (editingLabel) await updateLabel(editingLabel.id, { name, color })
          setEditingLabel(null)
        }}
        onCancel={() => setEditingLabel(null)}
      />
      <ConfirmDialog
        open={deletingLabelId !== null}
        title={`Delete label "${deletingLabel?.name}"?`}
        description="Label will be removed from all tasks."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deletingLabelId) {
            await stripLabelFromTasks(deletingLabelId)
            await deleteLabel(deletingLabelId)
          }
          setDeletingLabelId(null)
        }}
        onCancel={() => setDeletingLabelId(null)}
      />

      {/* ── Folder modals ─────────────────────────────────────────────────────── */}
      <ItemFormModal
        open={creatingFolder}
        title="New folder"
        onSave={async (name, color) => {
          await addFolder({ name, color, sort_order: folders.length })
          setCreatingFolder(false)
        }}
        onCancel={() => setCreatingFolder(false)}
      />
      <ItemFormModal
        open={editingFolder !== null}
        title="Edit folder"
        initialName={editingFolder?.name}
        initialColor={editingFolder?.color}
        onSave={async (name, color) => {
          if (editingFolder) await updateFolder(editingFolder.id, { name, color })
          setEditingFolder(null)
        }}
        onCancel={() => setEditingFolder(null)}
      />
      <ConfirmDialog
        open={deletingFolderId !== null}
        title={`Delete folder "${deletingFolder?.name}"?`}
        description="Tasks will be moved to Inbox."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deletingFolderId) {
            await moveTasksToFolder(deletingFolderId, INBOX_FOLDER_ID)
            await deleteFolder(deletingFolderId)
          }
          setDeletingFolderId(null)
        }}
        onCancel={() => setDeletingFolderId(null)}
      />
    </div>
  )
}
