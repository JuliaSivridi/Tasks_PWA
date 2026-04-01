import { create } from 'zustand'
import { db } from '@/services/db'
import { enqueue } from '@/services/offlineQueue'
import type { Task, TaskInput } from '@/types/task'
import { generateId } from '@/utils/uuid'
import { now } from '@/utils/dateUtils'

interface TasksState {
  tasks: Task[]
  loadFromDb: () => Promise<void>
  addTask: (input: TaskInput) => Promise<Task>
  updateTask: (id: string, changes: Partial<Task>) => Promise<void>
  setTaskExpanded: (id: string, is_expanded: boolean) => Promise<void>
  completeTask: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  upsertMany: (tasks: Task[]) => Promise<void>
  getChildren: (parentId: string) => Task[]
  getRootTasks: (folderId?: string) => Task[]
  moveTasksToFolder: (fromFolderId: string, toFolderId: string) => Promise<void>
  stripLabelFromTasks: (labelId: string) => Promise<void>
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],

  loadFromDb: async () => {
    const tasks = await db.tasks
      .where('status')
      .anyOf(['pending', 'completed'])
      .toArray()
    set({ tasks })
  },

  addTask: async (input) => {
    const siblings = get().tasks.filter(t =>
      t.folder_id === input.folder_id &&
      t.parent_id === input.parent_id &&
      t.status === 'pending',
    )
    const maxOrder = siblings.reduce((m, t) => Math.max(m, t.sort_order), -1)
    const task: Task = {
      id: generateId('tsk'),
      ...input,
      sort_order: maxOrder + 1,
      created_at: now(),
      updated_at: now(),
      completed_at: '',
      is_expanded: true,
    }
    await db.tasks.put(task)
    await enqueue('task', 'create', task.id, task as unknown as Record<string, unknown>)
    set((s) => ({ tasks: [...s.tasks, task] }))
    void import('@/services/syncService').then(({ scheduleFlush }) => { scheduleFlush() })
    return task
  },

  updateTask: async (id, changes) => {
    const existing = get().tasks.find(t => t.id === id)
    if (!existing) return
    const updated: Task = { ...existing, ...changes, updated_at: now() }
    await db.tasks.put(updated)
    await enqueue('task', 'update', id, updated as unknown as Record<string, unknown>)
    set((s) => ({ tasks: s.tasks.map(t => t.id === id ? updated : t) }))
    void import('@/services/syncService').then(({ scheduleFlush }) => { scheduleFlush() })
  },

  setTaskExpanded: async (id, is_expanded) => {
    const existing = get().tasks.find(t => t.id === id)
    if (!existing) return
    const updated: Task = { ...existing, is_expanded }
    await db.tasks.put(updated)
    await enqueue('task', 'update', id, updated as unknown as Record<string, unknown>)
    set((s) => ({ tasks: s.tasks.map(t => t.id === id ? updated : t) }))
    void import('@/services/syncService').then(({ scheduleFlush }) => { scheduleFlush() })
  },

  completeTask: async (id) => {
    const { updateTask, tasks } = get()
    // Collect the task itself + all pending descendants recursively
    const toComplete: string[] = [id]
    const collect = (parentId: string) => {
      for (const t of tasks) {
        if (t.parent_id === parentId && t.status === 'pending') {
          toComplete.push(t.id)
          collect(t.id)
        }
      }
    }
    collect(id)
    const completedAt = now()
    for (const taskId of toComplete) {
      await updateTask(taskId, { status: 'completed', completed_at: completedAt })
    }
    // Flush immediately — don't rely on the 800 ms debounce so the change
    // reaches Sheets before the user closes the app or switches device.
    void import('@/services/syncService').then(({ flush }) => { void flush() })
  },

  deleteTask: async (id) => {
    // Soft delete
    const { updateTask } = get()
    await updateTask(id, { status: 'deleted' })
    // Remove from UI
    set((s) => ({ tasks: s.tasks.filter(t => t.id !== id) }))
  },

  upsertMany: async (incoming) => {
    // Conflict resolution: last-write-wins by updated_at
    const existing = await db.tasks.bulkGet(incoming.map(t => t.id))
    const toStore = incoming.map((remote, i) => {
      const local = existing[i]
      if (local && local.updated_at > remote.updated_at) return local
      return remote
    })
    await db.tasks.bulkPut(toStore)
    const all = await db.tasks.where('status').anyOf(['pending', 'completed']).toArray()
    set({ tasks: all })
  },

  getChildren: (parentId) => {
    return get().tasks.filter(t => t.parent_id === parentId && t.status !== 'deleted')
  },

  getRootTasks: (folderId) => {
    const tasks = get().tasks.filter(t => t.parent_id === '' && t.status !== 'deleted')
    if (folderId !== undefined) {
      return tasks.filter(t => t.folder_id === folderId)
    }
    return tasks
  },

  moveTasksToFolder: async (fromFolderId, toFolderId) => {
    const { tasks, updateTask } = get()
    const toMove = tasks.filter(t => t.folder_id === fromFolderId && t.status !== 'deleted')
    for (const task of toMove) {
      await updateTask(task.id, { folder_id: toFolderId })
    }
  },

  stripLabelFromTasks: async (labelId) => {
    const { tasks, updateTask } = get()
    const affected = tasks.filter(t =>
      t.labels.split(',').filter(Boolean).includes(labelId),
    )
    for (const task of affected) {
      const newLabels = task.labels.split(',').filter(l => l && l !== labelId).join(',')
      await updateTask(task.id, { labels: newLabels })
    }
  },
}))
