import { create } from 'zustand'

export type SelectedView = 'upcoming' | 'all' | 'folder' | 'completed' | 'calendar'

interface UIState {
  selectedView: SelectedView
  selectedFolderId: string | null
  selectedCalendarId: string | null
  sidebarOpen: boolean
  createTaskOpen: boolean
  settingsOpen: boolean
  helpOpen: boolean
  feedbackOpen: boolean
  setView: (view: Exclude<SelectedView, 'calendar'>, id?: string) => void
  setCalendarView: (calendarId: string) => void
  setSidebarOpen: (v: boolean) => void
  setCreateTaskOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setHelpOpen: (v: boolean) => void
  setFeedbackOpen: (v: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedView: 'upcoming',
  selectedFolderId: null,
  selectedCalendarId: null,
  sidebarOpen: false,
  createTaskOpen: false,
  settingsOpen: false,
  helpOpen: false,
  feedbackOpen: false,

  setView: (view, id) => set({
    selectedView: view,
    selectedFolderId: view === 'folder' ? (id ?? null) : null,
    selectedCalendarId: null,
  }),

  setCalendarView: (calendarId) => set({
    selectedView: 'calendar',
    selectedCalendarId: calendarId,
    selectedFolderId: null,
  }),

  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setCreateTaskOpen: (v) => set({ createTaskOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setHelpOpen: (v) => set({ helpOpen: v }),
  setFeedbackOpen: (v) => set({ feedbackOpen: v }),
}))
