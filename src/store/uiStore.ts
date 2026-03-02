import { create } from 'zustand'

export type SelectedView = 'upcoming' | 'all' | 'folder' | 'completed'

interface UIState {
  selectedView: SelectedView
  selectedFolderId: string | null
  sidebarOpen: boolean
  createTaskOpen: boolean
  setView: (view: SelectedView, id?: string) => void
  setSidebarOpen: (v: boolean) => void
  setCreateTaskOpen: (v: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedView: 'upcoming',
  selectedFolderId: null,
  sidebarOpen: false,
  createTaskOpen: false,

  setView: (view, id) => set({
    selectedView: view,
    selectedFolderId: view === 'folder' ? (id ?? null) : null,
  }),

  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setCreateTaskOpen: (v) => set({ createTaskOpen: v }),
}))
