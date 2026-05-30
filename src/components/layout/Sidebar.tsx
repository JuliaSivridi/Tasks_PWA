import {
  CalendarClock, CheckCircle2, LayoutList, Inbox,
  Folder, RefreshCw, ChevronDown, ChevronRight,
  CalendarDays,
} from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useSyncStore } from '@/store/syncStore'
import { usePrefsStore } from '@/store/prefsStore'
import { useCalendarStore } from '@/store/calendarStore'
import { cn } from '@/lib/utils'
import { INBOX_FOLDER_ID } from '@/utils/constants'
import { format } from 'date-fns'
import { fullSync } from '@/services/syncService'

// ─── Section header with collapse toggle ──────────────────────────────────────

function SectionHeader({ label, sectionKey }: { label: string; sectionKey: string }) {
  const { sectionOpen, toggleSection } = usePrefsStore()
  const isOpen = sectionOpen[sectionKey] ?? true

  return (
    <div className="flex items-center px-2 mb-1">
      <button
        onClick={() => toggleSection(sectionKey)}
        className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {label}
      </button>
    </div>
  )
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export function Sidebar() {
  const {
    selectedView, selectedFolderId, selectedCalendarId,
    setView, setCalendarView, setCreateTaskOpen, setSidebarOpen,
  } = useUIStore()
  const goTo = (...args: Parameters<typeof setView>) => { setView(...args); setSidebarOpen(false) }
  const goToCalendar = (id: string) => { setCalendarView(id); setSidebarOpen(false) }

  const { folders } = useFoldersStore()
  const { lastSyncAt, isSyncing } = useSyncStore()
  const { sectionOpen, calendarEnabled, enabledCalendarIds, foldersEnabled } = usePrefsStore()
  const { calendars } = useCalendarStore()
  const enabledCalendars = calendars.filter(c => enabledCalendarIds.includes(c.id))

  const sortedFolders = [...folders].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="flex flex-col h-full select-none">
      {/* Add task button */}
      <div className="px-2 pt-2 pb-2">
        <button
          onClick={() => setCreateTaskOpen(true)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-base font-medium"
        >
          + Add task
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">

        {/* ── Navigation ── */}
        <div className="space-y-0.5">
          {([
            { view: 'upcoming' as const, label: 'Upcoming', icon: <CalendarClock size={16} /> },
            { view: 'all' as const, label: 'All tasks', icon: <LayoutList size={16} /> },
            { view: 'completed' as const, label: 'Completed', icon: <CheckCircle2 size={16} /> },
          ]).map(({ view, label, icon }) => (
            <button
              key={view}
              onClick={() => goTo(view)}
              className={cn(
                'flex items-center gap-2 w-full px-2 py-2 rounded-md text-base transition-colors hover:bg-accent',
                selectedView === view && 'bg-accent font-medium text-primary',
              )}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ── Folders (navigation only, shown when foldersEnabled) ── */}
        {foldersEnabled && (
          <div className="border-t pt-2 space-y-0.5">
            <SectionHeader label="Folders" sectionKey="folders" />
            {(sectionOpen.folders ?? true) && (
              <>
                {/* Inbox first */}
                {(() => {
                  const inbox = folders.find(f => f.id === INBOX_FOLDER_ID)
                  if (!inbox) return null
                  return (
                    <button
                      onClick={() => goTo('folder', INBOX_FOLDER_ID)}
                      className={cn(
                        'flex items-center gap-1.5 w-full px-2 py-2 rounded-md text-base cursor-pointer transition-colors hover:bg-accent',
                        selectedView === 'folder' && selectedFolderId === INBOX_FOLDER_ID && 'bg-accent font-medium text-primary',
                      )}
                    >
                      <Inbox size={16} className="flex-shrink-0 text-primary" />
                      <span className="flex-1 truncate text-left">Inbox</span>
                    </button>
                  )
                })()}

                {sortedFolders.filter(f => f.id !== INBOX_FOLDER_ID).map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => goTo('folder', folder.id)}
                    className={cn(
                      'flex items-center gap-1.5 w-full px-2 py-2 rounded-md text-base transition-colors hover:bg-accent',
                      selectedView === 'folder' && selectedFolderId === folder.id && 'bg-accent font-medium text-primary',
                    )}
                  >
                    <Folder size={16} className="flex-shrink-0" style={{ color: folder.color }} />
                    <span className="flex-1 truncate text-left">{folder.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Calendars ── */}
        {calendarEnabled && enabledCalendars.length > 0 && (
          <div className="border-t pt-2 space-y-0.5">
            <SectionHeader label="Calendars" sectionKey="calendars" />
            {(sectionOpen.calendars ?? true) && enabledCalendars.map(cal => (
              <button
                key={cal.id}
                onClick={() => goToCalendar(cal.id)}
                className={cn(
                  'flex items-center gap-1.5 w-full px-2 py-2 rounded-md text-base transition-colors hover:bg-accent',
                  selectedView === 'calendar' && selectedCalendarId === cal.id && 'bg-accent font-medium text-primary',
                )}
              >
                <CalendarDays size={16} className="flex-shrink-0" style={{ color: cal.color }} />
                <span className="flex-1 truncate text-left">{cal.summary}</span>
              </button>
            ))}
          </div>
        )}

      </div>

      {/* Footer: sync status + button */}
      <div className="px-3 py-2 border-t flex items-center gap-2">
        <button
          onClick={() => void fullSync()}
          disabled={isSyncing}
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          title="Sync"
        >
          <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
        </button>
        <span className="text-sm text-muted-foreground">
          {isSyncing ? 'Syncing...' : lastSyncAt ? `Synced ${format(new Date(lastSyncAt), 'HH:mm')}` : 'Not synced'}
        </span>
      </div>
    </div>
  )
}
