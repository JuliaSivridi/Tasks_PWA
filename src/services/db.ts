import Dexie, { type Table } from 'dexie'
import type { Task } from '@/types/task'
import type { Folder } from '@/types/folder'
import type { Label } from '@/types/label'
import type { QueueItem } from '@/types/sync'
import type { CalendarEvent } from '@/types/calendarEvent'

export class TaskManagerDB extends Dexie {
  tasks!: Table<Task>
  folders!: Table<Folder>
  labels!: Table<Label>
  queue!: Table<QueueItem>
  calendarEvents!: Table<CalendarEvent>

  constructor() {
    super('TaskManagerDB')
    this.version(1).stores({
      tasks:   '&id, parent_id, folder_id, status, updated_at',
      folders: '&id, parent_id',
      labels:  '&id',
      queue:   '++localId, entityType, operationType, status, createdAt',
    })
    this.version(2).stores({
      calendarEvents: '&id, startDate, calendarId',
    })
    this.version(3).stores({
      folders: '&id',  // drop unused parent_id index (Folder type has no parent_id)
    })
  }
}

export const db = new TaskManagerDB()
