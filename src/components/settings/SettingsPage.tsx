import { useState } from 'react'
import { ArrowLeft, Check, Table2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { listUserSheets } from '@/api/driveApi'
import { initialLoad } from '@/services/syncService'
import { invalidateRowCache } from '@/api/sheetsClient'
import { db } from '@/services/db'
import { cn } from '@/lib/utils'

export function SettingsPage() {
  const { setSettingsOpen } = useUIStore()
  const { spreadsheetId, spreadsheetName, setSpreadsheet } = useAuthStore()

  const [pickerOpen, setPickerOpen]     = useState(false)
  const [pickerFiles, setPickerFiles]   = useState<{ id: string; name: string }[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [switching, setSwitching]       = useState(false)

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

  const displayName = spreadsheetName || spreadsheetId || '—'

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 h-14 border-b bg-background flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-muted-foreground hover:text-foreground"
          onClick={() => setSettingsOpen(false)}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </Button>
        <span className="font-semibold text-base">Settings</span>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-2">

          {/* Section label */}
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-3">
            Spreadsheet
          </p>

          {/* Sheet row */}
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
                onClick={handleOpenPicker}
                disabled={switching}
                aria-expanded={pickerOpen}
              >
                {switching ? (
                  <><Loader2 size={12} className="animate-spin mr-1" />Switching…</>
                ) : pickerOpen ? 'Cancel' : 'Change'}
              </Button>
            </div>

            {/* Picker list */}
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
                          onClick={() => handlePickFile(file)}
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
      </div>
    </div>
  )
}
