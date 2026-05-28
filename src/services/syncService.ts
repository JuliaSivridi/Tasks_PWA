import { fetchAllTasks, appendTask, updateTask as apiUpdateTask, ensureHeader } from '@/api/tasksApi'
import { fetchAllFolders, appendFolder, updateFolder as apiUpdateFolder, ensureFolderHeader } from '@/api/foldersApi'
import { fetchAllLabels, appendLabel, updateLabel as apiUpdateLabel, ensureLabelHeader } from '@/api/labelsApi'
import { getPending, markProcessing, markDone, markFailed, getQueueLength } from '@/services/offlineQueue'
import { invalidateRowCache } from '@/api/sheetsClient'
import { listCalendars, listEvents } from '@/api/calendarApi'
import { useTasksStore } from '@/store/tasksStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useLabelsStore } from '@/store/labelsStore'
import { useSyncStore } from '@/store/syncStore'
import { useCalendarStore } from '@/store/calendarStore'
import { usePrefsStore } from '@/store/prefsStore'
import { db } from '@/services/db'
import { addDays, startOfDay } from 'date-fns'
import { now } from '@/utils/dateUtils'
import type { Task } from '@/types/task'
import type { Folder } from '@/types/folder'
import type { Label } from '@/types/label'

/**
 * Clears all local data (Dexie tables + in-memory store state).
 * Called on logout so the next user starts with a clean slate.
 */
export async function clearLocalData(): Promise<void> {
  await Promise.all([
    db.tasks.clear(),
    db.folders.clear(),
    db.labels.clear(),
    db.queue.clear(),
    db.calendarEvents.clear(),
  ])
  useTasksStore.setState({ tasks: [] })
  useFoldersStore.setState({ folders: [] })
  useLabelsStore.setState({ labels: [] })
  useCalendarStore.setState({ events: [], calendars: [] })
  useSyncStore.getState().setPendingCount(0)
}

async function processQueueItem(item: NonNullable<Awaited<ReturnType<typeof getPending>>[number]>): Promise<void> {
  const { entityType, operationType, payload } = item

  if (entityType === 'task') {
    const task = payload as unknown as Task
    if (operationType === 'create') await appendTask(task)
    else if (operationType === 'update') await apiUpdateTask(task)
    else if (operationType === 'delete') await apiUpdateTask({ ...task, status: 'deleted' })
  } else if (entityType === 'folder') {
    const folder = payload as unknown as Folder
    if (operationType === 'create') await appendFolder(folder)
    else if (operationType === 'update') await apiUpdateFolder(folder)
  } else if (entityType === 'label') {
    const label = payload as unknown as Label
    if (operationType === 'create') await appendLabel(label)
    else if (operationType === 'update') await apiUpdateLabel(label)
  }
}

export async function flush(): Promise<void> {
  const items = await getPending()
  if (items.length === 0) return

  // Deduplicate: for each (entityType, entityId, operationType) keep only the
  // latest item. Older duplicates are discarded without sending to Sheets.
  const latestMap = new Map<string, typeof items[0]>()
  for (const item of items) {
    const key = `${item.entityType}:${item.entityId}:${item.operationType}`
    const existing = latestMap.get(key)
    if (!existing || item.createdAt > existing.createdAt) {
      latestMap.set(key, item)
    }
  }
  const latestIds = new Set(Array.from(latestMap.values()).map(i => i.localId))

  // Discard superseded items
  for (const item of items) {
    if (item.localId && !latestIds.has(item.localId)) {
      await markDone(item.localId)
    }
  }

  // Process only the latest item for each entity
  for (const item of latestMap.values()) {
    if (!item.localId) continue
    try {
      await markProcessing(item.localId)
      await processQueueItem(item)
      await markDone(item.localId)
    } catch (err) {
      console.error('Sync flush error', err)
      await markFailed(item.localId, item.retryCount + 1)
    }
  }

  invalidateRowCache()
  const pending = await getQueueLength()
  useSyncStore.getState().setPendingCount(pending)
}

/**
 * Fetches calendar events for all enabled calendars and updates calendarStore + Dexie.
 * Guarded by calendarEnabled; on error falls back to the Dexie cache.
 */
export async function pullCalendar(): Promise<void> {
  const { calendarEnabled, enabledCalendarIds } = usePrefsStore.getState()
  if (!calendarEnabled) return

  const calStore = useCalendarStore.getState()
  calStore.setLoading(true)
  try {
    const today = startOfDay(new Date())
    const timeMin = today.toISOString()
    const timeMax = addDays(today, 366).toISOString()

    const cals = await listCalendars()
    calStore.setCalendars(cals)

    const allEvents = (
      await Promise.all(
        enabledCalendarIds.map(id => {
          const cal = cals.find(c => c.id === id)
          if (!cal) return Promise.resolve([])
          return listEvents(id, cal.summary, cal.color, timeMin, timeMax)
        }),
      )
    ).flat()

    await calStore.setEvents(allEvents)
  } catch (err) {
    console.error('Calendar sync error', err)
    await calStore.loadFromDb()
  } finally {
    calStore.setLoading(false)
  }
}

export async function pull(): Promise<void> {
  const [tasks, folders, labels] = await Promise.all([
    fetchAllTasks(),
    fetchAllFolders(),
    fetchAllLabels(),
  ])

  await Promise.all([
    useTasksStore.getState().upsertMany(tasks),
    useFoldersStore.getState().upsertMany(folders),
    useLabelsStore.getState().upsertMany(labels),
  ])

  useSyncStore.getState().setLastSyncAt(now())
}

export async function initialLoad(): Promise<void> {
  const sync = useSyncStore.getState()
  sync.setSyncing(true)
  sync.setSyncError(null)
  try {
    // Ensure sheet headers exist
    await Promise.all([ensureHeader(), ensureFolderHeader(), ensureLabelHeader()])
    // Flush any offline changes first, then pull latest
    await flush()
    await pull()
    await pullCalendar()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sync.setSyncError(msg)
    // Load from local DB as fallback
    await Promise.all([
      useTasksStore.getState().loadFromDb(),
      useFoldersStore.getState().loadFromDb(),
      useLabelsStore.getState().loadFromDb(),
    ])
  } finally {
    // Always ensure Inbox folder exists
    await useFoldersStore.getState().ensureInbox()
    sync.setSyncing(false)
    const pending = await getQueueLength()
    sync.setPendingCount(pending)
  }
}

// Debounced flush for DnD — batches rapid drags into a single Sheets write.
// Unlike fullSync(), this is not blocked by isSyncing.
let _flushTimer: ReturnType<typeof setTimeout> | null = null
let _flushing = false

export function scheduleFlush(): void {
  if (_flushTimer) clearTimeout(_flushTimer)
  _flushTimer = setTimeout(() => {
    _flushTimer = null
    if (_flushing) return
    _flushing = true
    flush().finally(() => { _flushing = false })
  }, 800)
}

export async function fullSync(): Promise<void> {
  const sync = useSyncStore.getState()
  if (sync.isSyncing) return
  sync.setSyncing(true)
  sync.setSyncError(null)
  try {
    await flush()
    await pull()
    await pullCalendar()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sync.setSyncError(msg)
  } finally {
    sync.setSyncing(false)
    const pending = await getQueueLength()
    sync.setPendingCount(pending)
  }
}
