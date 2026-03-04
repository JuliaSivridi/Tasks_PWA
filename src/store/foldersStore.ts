import { create } from 'zustand'
import { db } from '@/services/db'
import { enqueue } from '@/services/offlineQueue'
import type { Folder, FolderInput } from '@/types/folder'
import { generateId } from '@/utils/uuid'
import { INBOX_FOLDER_ID } from '@/utils/constants'

interface FoldersState {
  folders: Folder[]
  loadFromDb: () => Promise<void>
  addFolder: (input: FolderInput) => Promise<Folder>
  updateFolder: (id: string, changes: Partial<Folder>) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  upsertMany: (folders: Folder[]) => Promise<void>
  ensureInbox: () => Promise<void>
}

export const useFoldersStore = create<FoldersState>((set, get) => ({
  folders: [],

  loadFromDb: async () => {
    const folders = await db.folders.toArray()
    set({ folders })
  },

  addFolder: async (input) => {
    const folder: Folder = { id: generateId('fld'), ...input }
    await db.folders.put(folder)
    await enqueue('folder', 'create', folder.id, folder as unknown as Record<string, unknown>)
    set((s) => ({ folders: [...s.folders, folder] }))
    void import('@/services/syncService').then(({ scheduleFlush }) => { scheduleFlush() })
    return folder
  },

  updateFolder: async (id, changes) => {
    const existing = get().folders.find(f => f.id === id)
    if (!existing) return
    const updated = { ...existing, ...changes }
    await db.folders.put(updated)
    await enqueue('folder', 'update', id, updated as unknown as Record<string, unknown>)
    set((s) => ({ folders: s.folders.map(f => f.id === id ? updated : f) }))
    void import('@/services/syncService').then(({ scheduleFlush }) => { scheduleFlush() })
  },

  deleteFolder: async (id) => {
    await db.folders.delete(id)
    await enqueue('folder', 'delete', id, { id })
    set((s) => ({ folders: s.folders.filter(f => f.id !== id) }))
    void import('@/services/syncService').then(({ scheduleFlush }) => { scheduleFlush() })
  },

  upsertMany: async (folders) => {
    await db.folders.bulkPut(folders)
    const all = await db.folders.toArray()
    set({ folders: all })
  },

  ensureInbox: async () => {
    const existing = get().folders.find(f => f.id === INBOX_FOLDER_ID)
    if (existing) return
    const inbox: Folder = { id: INBOX_FOLDER_ID, name: 'Inbox', color: '#f97316', sort_order: -1 }
    await db.folders.put(inbox)
    await enqueue('folder', 'create', inbox.id, inbox as unknown as Record<string, unknown>)
    set((s) => ({ folders: [inbox, ...s.folders] }))
  },
}))
