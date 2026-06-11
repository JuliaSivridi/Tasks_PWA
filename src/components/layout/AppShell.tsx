import { useEffect } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { TaskList } from '@/components/tasks/TaskList'
import { TaskFilterPanel } from '@/components/tasks/TaskFilterPanel'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { HelpPage } from '@/components/help/HelpPage'
import { FeedbackPage } from '@/components/feedback/FeedbackPage'
import { useUIStore } from '@/store/uiStore'
import { useSync } from '@/hooks/useSync'
import { initialLoad, loadFromCache } from '@/services/syncService'
import { ensureSpreadsheet } from '@/api/spreadsheetSetup'
import { seedOnboarding } from '@/api/seedOnboarding'
import { usePrefsStore } from '@/store/prefsStore'

export function AppShell() {
  const { sidebarOpen, setSidebarOpen, settingsOpen, helpOpen, feedbackOpen, filterPanelOpen, setFilterPanelOpen } = useUIStore()
  useSync()

  useEffect(() => {
    const setup = async () => {
      await loadFromCache()   // instant UI from Dexie before any network work
      const { isNew } = await ensureSpreadsheet()
      if (isNew) await seedOnboarding()
      await initialLoad()
      await usePrefsStore.getState().load()
    }
    void setup()
  }, [])

  return (
    <div className="flex flex-col h-dvh bg-background">
      <Header />

      {/* Filter panel — bottom sheet (same pattern as Money) */}
      <TaskFilterPanel
        open={filterPanelOpen && !settingsOpen && !helpOpen && !feedbackOpen}
        onClose={() => setFilterPanelOpen(false)}
      />

      <div className="flex flex-1 overflow-hidden">
        {!settingsOpen && !helpOpen && !feedbackOpen && (
          <>
            {/* Desktop sidebar */}
            <aside className="hidden md:flex flex-col w-60 border-r flex-shrink-0 overflow-hidden">
              <Sidebar />
            </aside>

            {/* Mobile sidebar (drawer) */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetContent side="left" className="p-0 w-60">
                <Sidebar />
              </SheetContent>
            </Sheet>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-hidden">
          {helpOpen ? <HelpPage />
            : feedbackOpen ? <FeedbackPage />
            : settingsOpen ? <SettingsPage />
            : <TaskList />}
        </main>
      </div>
    </div>
  )
}
