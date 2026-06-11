import { Menu, LogOut, Settings, ChevronLeft, HelpCircle, MessageSquare, Cloud, CloudOff, CloudAlert, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useCalendarStore } from '@/store/calendarStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useSyncStore } from '@/store/syncStore'
import { flush, clearLocalData, fullSync } from '@/services/syncService'

export function Header() {
  const { user, logout } = useAuthStore()

  const handleSignOut = async () => {
    try { await flush() } catch { /* best effort — don't block logout on network errors */ }
    await clearLocalData()
    logout()
  }
  const {
    setSidebarOpen, sidebarOpen,
    selectedView, selectedFolderId, selectedCalendarId,
    settingsOpen, setSettingsOpen,
    helpOpen, setHelpOpen,
    feedbackOpen, setFeedbackOpen,
    filterPanelOpen, setFilterPanelOpen, taskFilters,
  } = useUIStore()
  const { folders } = useFoldersStore()
  const { calendars } = useCalendarStore()
  const { isOnline, isSyncing, pendingCount, syncError } = useSyncStore()

  const viewTitle = selectedView === 'upcoming' ? 'Upcoming'
    : selectedView === 'all' ? 'All tasks'
    : selectedView === 'completed' ? 'Completed'
    : selectedView === 'calendar' ? (calendars.find(c => c.id === selectedCalendarId)?.summary ?? 'Calendar')
    : (folders.find(f => f.id === selectedFolderId)?.name ?? 'Folder')

  const overlayOpen = settingsOpen || helpOpen || feedbackOpen
  const overlayBack = settingsOpen
    ? () => setSettingsOpen(false)
    : helpOpen
      ? () => setHelpOpen(false)
      : () => setFeedbackOpen(false)

  return (
    <header className="flex items-center gap-3 px-4 h-14 border-b bg-background flex-shrink-0">
      {overlayOpen ? (
        /* Back button — replaces hamburger when an overlay screen is open */
        <Button
          variant="ghost"
          size="sm"
          onClick={overlayBack}
          aria-label="Back"
        >
          <ChevronLeft size={18} />
        </Button>
      ) : (
        /* Mobile sidebar toggle */
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu size={18} />
        </Button>
      )}

      {/* Title */}
      <span className="font-semibold text-base">
        {settingsOpen ? 'Settings' : helpOpen ? 'Short guide' : feedbackOpen ? 'Feedback' : viewTitle}
      </span>

      <div className="ml-auto flex items-center gap-1">
        {/* Filter toggle — opens the Money-style filter panel */}
        {!overlayOpen && (() => {
          const filtersActive =
            taskFilters.priorities.length > 0 || taskFilters.labels.length > 0 ||
            taskFilters.folders.length > 0 || taskFilters.calendars.length > 0
          return (
            <button
              onClick={() => setFilterPanelOpen(!filterPanelOpen)}
              className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${
                filtersActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : filterPanelOpen
                    ? 'border-border text-foreground bg-accent'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              aria-label="Filters"
            >
              <SlidersHorizontal size={16} />
            </button>
          )
        })()}

        {/* Persistent cloud indicator (mirrors the Android client): cloud with a
            pending-count badge, spinning arrow while a sync is in flight. */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => void fullSync()}
                className={`relative flex items-center justify-center w-9 h-9 ${
                  !isOnline ? 'text-amber-500 dark:text-amber-400'
                  : syncError ? 'text-destructive'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label="Sync status"
              >
                {isSyncing
                  ? <RefreshCw size={17} className="animate-spin" />
                  : !isOnline ? <CloudOff size={18} />
                  : syncError ? <CloudAlert size={18} />
                  : <Cloud size={18} />}
                {pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-primary text-primary-foreground text-[10px] leading-[15px] text-center font-medium">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {!isOnline ? `Offline${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}`
                : syncError ? 'Sync error — tap to retry'
                : isSyncing ? 'Syncing…'
                : pendingCount > 0 ? `${pendingCount} changes pending — tap to sync`
                : 'Synced — tap to refresh'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* User avatar dropdown */}
        {user && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-8 h-8 rounded-full overflow-hidden border-2 border-border hover:border-primary transition-colors">
                      {user.picture ? (
                        <img src={user.picture} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
                          {user.name[0]}
                        </div>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div className="px-2 py-1.5 border-b">
                      <p className="text-sm font-medium truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                      <Settings size={14} className="mr-2" /> Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHelpOpen(true)}>
                      <HelpCircle size={14} className="mr-2" /> Help
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
                      <MessageSquare size={14} className="mr-2" /> Feedback
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void handleSignOut()} className="text-destructive">
                      <LogOut size={14} className="mr-2" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipTrigger>
              <TooltipContent>{user.email}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </header>
  )
}
