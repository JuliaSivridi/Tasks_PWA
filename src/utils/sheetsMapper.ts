import type { Task, Priority, TaskStatus, RecurType } from '@/types/task'
import type { Folder } from '@/types/folder'
import type { Label } from '@/types/label'
import { TASK_COL, FOLDER_COL, LABEL_COL } from './constants'

function cell(row: string[], idx: number): string {
  return row[idx] ?? ''
}

// ─── Task ────────────────────────────────────────────────────────────────────

export function rowToTask(row: string[]): Task {
  return {
    id:            cell(row, TASK_COL.ID),
    parent_id:     cell(row, TASK_COL.PARENT_ID),
    folder_id:     cell(row, TASK_COL.FOLDER_ID),
    title:         cell(row, TASK_COL.TITLE),
    status:        (cell(row, TASK_COL.STATUS) || 'pending') as TaskStatus,
    priority:      (cell(row, TASK_COL.PRIORITY) || 'normal') as Priority,
    deadline_date: cell(row, TASK_COL.DEADLINE_DATE),
    deadline_time: cell(row, TASK_COL.DEADLINE_TIME),
    is_recurring:  cell(row, TASK_COL.IS_RECURRING) === 'TRUE',
    recur_type:    (cell(row, TASK_COL.RECUR_TYPE) || '') as RecurType | '',
    recur_value:   Number(cell(row, TASK_COL.RECUR_VALUE)) || 1,
    labels:        cell(row, TASK_COL.LABELS),
    sort_order:    Number(cell(row, TASK_COL.SORT_ORDER)) || 0,
    created_at:    cell(row, TASK_COL.CREATED_AT),
    updated_at:    cell(row, TASK_COL.UPDATED_AT),
    completed_at:  cell(row, TASK_COL.COMPLETED_AT),
    is_expanded:   cell(row, TASK_COL.IS_EXPANDED) !== 'FALSE',
  }
}

export function taskToRow(task: Task): string[] {
  const row = new Array(17).fill('')
  row[TASK_COL.ID]            = task.id
  row[TASK_COL.PARENT_ID]     = task.parent_id
  row[TASK_COL.FOLDER_ID]     = task.folder_id
  row[TASK_COL.TITLE]         = task.title
  row[TASK_COL.STATUS]        = task.status
  row[TASK_COL.PRIORITY]      = task.priority
  row[TASK_COL.DEADLINE_DATE] = task.deadline_date
  row[TASK_COL.DEADLINE_TIME] = task.deadline_time
  row[TASK_COL.IS_RECURRING]  = task.is_recurring ? 'TRUE' : 'FALSE'
  row[TASK_COL.RECUR_TYPE]    = task.recur_type
  row[TASK_COL.RECUR_VALUE]   = String(task.recur_value)
  row[TASK_COL.LABELS]        = task.labels
  row[TASK_COL.SORT_ORDER]    = String(task.sort_order)
  row[TASK_COL.CREATED_AT]    = task.created_at
  row[TASK_COL.UPDATED_AT]    = task.updated_at
  row[TASK_COL.COMPLETED_AT]  = task.completed_at ?? ''
  row[TASK_COL.IS_EXPANDED]   = task.is_expanded === false ? 'FALSE' : 'TRUE'
  return row
}

// ─── Folder (id | name | color | sort_order) ─────────────────────────────────

export function rowToFolder(row: string[]): Folder {
  return {
    id:         cell(row, FOLDER_COL.ID),
    name:       cell(row, FOLDER_COL.NAME),
    color:      cell(row, FOLDER_COL.COLOR),
    sort_order: Number(cell(row, FOLDER_COL.SORT_ORDER)) || 0,
  }
}

export function folderToRow(folder: Folder): string[] {
  const row = new Array(4).fill('')
  row[FOLDER_COL.ID]         = folder.id
  row[FOLDER_COL.NAME]       = folder.name
  row[FOLDER_COL.COLOR]      = folder.color
  row[FOLDER_COL.SORT_ORDER] = String(folder.sort_order)
  return row
}

// ─── Label (id | name | color | sort_order) ──────────────────────────────────

export function rowToLabel(row: string[]): Label {
  return {
    id:         cell(row, LABEL_COL.ID),
    name:       cell(row, LABEL_COL.NAME),
    color:      cell(row, LABEL_COL.COLOR),
    sort_order: Number(cell(row, LABEL_COL.SORT_ORDER)) || 0,
  }
}

export function labelToRow(label: Label): string[] {
  const row = new Array(4).fill('')
  row[LABEL_COL.ID]         = label.id
  row[LABEL_COL.NAME]       = label.name
  row[LABEL_COL.COLOR]      = label.color
  row[LABEL_COL.SORT_ORDER] = String(label.sort_order)
  return row
}

// ─── Parse rows (skip header) ─────────────────────────────────────────────────

export function parseTaskRows(values: string[][]): Task[] {
  return values.slice(1).filter(r => r[0]).map(rowToTask)
}

export function parseFolderRows(values: string[][]): Folder[] {
  return values.slice(1).filter(r => r[0]).map(rowToFolder)
}

export function parseLabelRows(values: string[][]): Label[] {
  return values.slice(1).filter(r => r[0]).map(rowToLabel)
}
