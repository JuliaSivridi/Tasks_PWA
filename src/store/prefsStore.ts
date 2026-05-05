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

  toggleSection: (key: string) => void
  setCalendarEnabled: (v: boolean) => void
  setEnabledCalendarIds: (ids: string[]) => void
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
  }
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  sectionOpen: { ...DEFAULT_SECTIONS },
  loaded: false,
  calendarEnabled: false,
  enabledCalendarIds: [],

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

  load: async () => {
    const { loadSettings } = await import('@/api/settingsApi')
    const settings = await loadSettings()

    const remote = settings.sectionOpen as Record<string, boolean> | undefined
    const sectionOpen = remote ? { ...DEFAULT_SECTIONS, ...remote } : { ...DEFAULT_SECTIONS }

    const calendarEnabled = Boolean(settings.calendarEnabled ?? false)
    const enabledCalendarIds = Array.isArray(settings.enabledCalendarIds)
      ? (settings.enabledCalendarIds as string[])
      : []

    set({ sectionOpen, calendarEnabled, enabledCalendarIds, loaded: true })
  },
}))
