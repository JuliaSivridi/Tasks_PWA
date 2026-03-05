import { create } from 'zustand'

const DEFAULT_SECTIONS: Record<string, boolean> = {
  priorities: true,
  folders: true,
  labels: true,
}

interface PrefsState {
  sectionOpen: Record<string, boolean>
  loaded: boolean
  toggleSection: (key: string) => void
  load: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(data: Record<string, unknown>): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void import('@/api/settingsApi').then(({ saveSettings }) => saveSettings(data))
  }, 1000)
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  sectionOpen: { ...DEFAULT_SECTIONS },
  loaded: false,

  toggleSection: (key) => {
    const current = get().sectionOpen[key] ?? true
    const sectionOpen = { ...get().sectionOpen, [key]: !current }
    set({ sectionOpen })
    scheduleSave({ sectionOpen })
  },

  load: async () => {
    const { loadSettings } = await import('@/api/settingsApi')
    const settings = await loadSettings()
    const remote = settings.sectionOpen as Record<string, boolean> | undefined
    const sectionOpen = remote ? { ...DEFAULT_SECTIONS, ...remote } : { ...DEFAULT_SECTIONS }
    set({ sectionOpen, loaded: true })
  },
}))
