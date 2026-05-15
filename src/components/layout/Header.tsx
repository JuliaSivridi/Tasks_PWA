import { Menu, LogOut, Settings, ChevronLeft, HelpCircle, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useLabelsStore } from '@/store/labelsStore'
import { useCalendarStore } from '@/store/calendarStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function Header() {
  const { user, logout } = useAuthStore()
  const {
    setSidebarOpen, sidebarOpen,
    selectedView, selectedFolderId, selectedLabelId, selectedPriority, selectedCalendarId,
    settingsOpen, setSettingsOpen,
    helpOpen, setHelpOpen,
    feedbackOpen, setFeedbackOpen,
  } = useUIStore()
  const { folders } = useFoldersStore()
  const { labels } = useLabelsStore()
  const { calendars } = useCalendarStore()

  const PRIORITY_LABELS: Record<string, string> = { urgent: 'Urgent', important: 'Important', normal: 'Normal' }

  const viewTitle = selectedView === 'upcoming' ? 'Upcoming'
    : selectedView === 'all' ? 'All tasks'
    : selectedView === 'completed' ? 'Completed'
    : selectedView === 'label' ? (labels.find(l => l.id === selectedLabelId)?.name ?? 'Label')
    : selectedView === 'priority' ? (PRIORITY_LABELS[selectedPriority ?? ''] ?? 'Priority')
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
                      <HelpCircle size={14} className="mr-2" /> Short guide
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
                      <MessageSquare size={14} className="mr-2" /> Feedback
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-destructive">
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
