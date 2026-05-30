import { create } from 'zustand'

const DEFAULT_SECTIONS: Record<string, boolean> = {
  priorities: true,
  folders: true,
  labels: true,
}

interface PrefsState {
  sectionOpen: Record<string, boolean>
  loaded: boolean

  /** Calendar integration — opt-in, default off */
  calendarEnabled: boolean
  /** IDs of calendars the user chose to sync */
  enabledCalendarIds: string[]

  /** Feature toggles — all default true (existing users see no change) */
  prioritiesEnabled: boolean
  labelsEnabled: boolean
  foldersEnabled: boolean

  toggleSection: (key: string) => void
  setCalendarEnabled: (v: boolean) => void
  setEnabledCalendarIds: (ids: string[]) => void
  setPrioritiesEnabled: (v: boolean) => void
  setLabelsEnabled: (v: boolean) => void
  setFoldersEnabled: (v: boolean) => void
  load: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(data: Record<string, unknown>): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void import('@/api/settingsApi').then(({ saveSettings }) => saveSettings(data))
  }, 1000)
}

function getSnapshot(state: PrefsState): Record<string, unknown> {
  return {
    sectionOpen: state.sectionOpen,
    calendarEnabled: state.calendarEnabled,
    enabledCalendarIds: state.enabledCalendarIds,
    prioritiesEnabled: state.prioritiesEnabled,
    labelsEnabled: state.labelsEnabled,
    foldersEnabled: state.foldersEnabled,
  }
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  sectionOpen: { ...DEFAULT_SECTIONS },
  loaded: false,
  calendarEnabled: false,
  enabledCalendarIds: [],
  prioritiesEnabled: true,
  labelsEnabled: true,
  foldersEnabled: true,

  toggleSection: (key) => {
    const current = get().sectionOpen[key] ?? true
    const sectionOpen = { ...get().sectionOpen, [key]: !current }
    set({ sectionOpen })
    scheduleSave(getSnapshot({ ...get(), sectionOpen }))
  },

  setCalendarEnabled: (v) => {
    set({ calendarEnabled: v })
    scheduleSave(getSnapshot({ ...get(), calendarEnabled: v }))
  },

  setEnabledCalendarIds: (ids) => {
    set({ enabledCalendarIds: ids })
    scheduleSave(getSnapshot({ ...get(), enabledCalendarIds: ids }))
  },

  setPrioritiesEnabled: (v) => {
    set({ prioritiesEnabled: v })
    scheduleSave(getSnapshot({ ...get(), prioritiesEnabled: v }))
  },

  setLabelsEnabled: (v) => {
    set({ labelsEnabled: v })
    scheduleSave(getSnapshot({ ...get(), labelsEnabled: v }))
  },

  setFoldersEnabled: (v) => {
    set({ foldersEnabled: v })
    scheduleSave(getSnapshot({ ...get(), foldersEnabled: v }))
  },

  load: async () => {
    const { loadSettings } = await import('@/api/settingsApi')
    const settings = await loadSettings()

    const remote = settings.sectionOpen as Record<string, boolean> | undefined
    const sectionOpen = remote ? { ...DEFAULT_SECTIONS, ...remote } : { ...DEFAULT_SECTIONS }

    const calendarEnabled = Boolean(settings.calendarEnabled ?? false)
    const enabledCalendarIds = Array.isArray(settings.enabledCalendarIds)
      ? (settings.enabledCalendarIds as string[])
      : []

    // Feature flags — default true so existing users see no change
    const prioritiesEnabled = settings.prioritiesEnabled !== undefined
      ? Boolean(settings.prioritiesEnabled)
      : true
    const labelsEnabled = settings.labelsEnabled !== undefined
      ? Boolean(settings.labelsEnabled)
      : true
    const foldersEnabled = settings.foldersEnabled !== undefined
      ? Boolean(settings.foldersEnabled)
      : true

    set({
      sectionOpen, calendarEnabled, enabledCalendarIds,
      prioritiesEnabled, labelsEnabled, foldersEnabled,
      loaded: true,
    })
  },
}))
