import { useState } from 'react'
import { Check, ChevronDown, ExternalLink, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { listUserSheets } from '@/api/driveApi'
import { initialLoad } from '@/services/syncService'
import { invalidateRowCache } from '@/api/sheetsClient'
import { db } from '@/services/db'
import { cn } from '@/lib/utils'

export function SettingsPage() {
  const { settingsOpen, setSettingsOpen } = useUIStore()
  const { spreadsheetId, spreadsheetName, setSpreadsheet } = useAuthStore()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerFiles, setPickerFiles] = useState<{ id: string; name: string }[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  async function handleOpenPicker() {
    if (pickerOpen) {
      setPickerOpen(false)
      return
    }
    setPickerOpen(true)
    setPickerLoading(true)
    setPickerError(null)
    try {
      const files = await listUserSheets()
      setPickerFiles(files)
    } catch {
      setPickerError('Could not load files from Google Drive')
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
      // 1. Update stored spreadsheet reference
      setSpreadsheet(file.id, file.name)

      // 2. Clear all local data (Dexie + row cache)
      await Promise.all([
        db.tasks.clear(),
        db.folders.clear(),
        db.labels.clear(),
        db.queue.clear(),
      ])
      invalidateRowCache()

      // 3. Close settings and trigger fresh sync from new spreadsheet
      setSettingsOpen(false)
      await initialLoad()
    } finally {
      setSwitching(false)
    }
  }

  const displayName = spreadsheetName || spreadsheetId || '—'

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* ── Spreadsheet section ─────────────────────────────────── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Google Spreadsheet</h3>

            {/* Current file */}
            <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{displayName}</p>
                {spreadsheetId && (
                  <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                    {spreadsheetId}
                  </p>
                )}
              </div>
              {spreadsheetId && (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  title="Open in Google Sheets"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>

            {/* Picker trigger */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between"
                onClick={handleOpenPicker}
                disabled={switching}
              >
                <span>{switching ? 'Switching…' : 'Change spreadsheet'}</span>
                {switching
                  ? <Loader2 size={14} className="animate-spin" />
                  : <ChevronDown size={14} className={cn('transition-transform', pickerOpen && 'rotate-180')} />
                }
              </Button>

              {/* Picker dropdown */}
              {pickerOpen && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                  {pickerLoading ? (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      Loading your spreadsheets…
                    </div>
                  ) : pickerFiles.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      No Google Sheets found in your Drive.
                    </p>
                  ) : (
                    <ul className="max-h-60 overflow-y-auto py-1">
                      {pickerFiles.map((file) => (
                        <li key={file.id}>
                          <button
                            className={cn(
                              'w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left',
                              'hover:bg-muted/60 transition-colors',
                              file.id === spreadsheetId && 'bg-muted/40',
                            )}
                            onClick={() => handlePickFile(file)}
                          >
                            <span className="flex-1 truncate">{file.name}</span>
                            {file.id === spreadsheetId && (
                              <Check size={13} className="text-primary flex-shrink-0" />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {pickerError && (
              <p className="mt-2 text-xs text-destructive">{pickerError}</p>
            )}

            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              All your tasks, folders and labels are stored in a Google Sheets file in your Drive.
              Switch to a different file to manage separate task lists.
            </p>
          </div>

          {/* ── Divider ─────────────────────────────────────────────── */}
          <div className="border-t border-border" />

          {/* ── Open in Sheets shortcut ──────────────────────────────── */}
          {spreadsheetId && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Open data source</p>
                <p className="text-xs text-muted-foreground mt-0.5">View or edit raw data in Google Sheets</p>
              </div>
              <a
                href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink size={13} />
                  Open
                </Button>
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
