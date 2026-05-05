import { useEffect } from 'react'
import { useSyncStore } from '@/store/syncStore'
import { usePrefsStore } from '@/store/prefsStore'
import { fullSync, flush, pullCalendar } from '@/services/syncService'

export function useSync() {
  const { isOnline, setOnline, lastSyncAt } = useSyncStore()
  const calendarEnabled = usePrefsStore(s => s.calendarEnabled)

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      void fullSync()
    }
    const handleOffline = () => setOnline(false)

    // Flush queued writes immediately when app goes to background or is closed.
    // Critical for mobile PWA: visibilitychange fires when user switches apps,
    // pagehide fires on tab/window close and iOS Safari navigation.
    const handleHide = () => { void flush() }

    // Pull fresh data when app becomes visible again (if stale > 5 min)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleHide()
      } else if (document.visibilityState === 'visible' && lastSyncAt) {
        const age = Date.now() - new Date(lastSyncAt).getTime()
        if (age > 5 * 60 * 1000) void fullSync()
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('pagehide', handleHide)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('pagehide', handleHide)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [setOnline, lastSyncAt])

  // C-02: when the user enables Calendar, fetch immediately
  useEffect(() => {
    if (calendarEnabled) void pullCalendar()
  }, [calendarEnabled])

  return { isOnline }
}
