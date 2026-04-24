// Sheet names
export const SHEET_TASKS = 'tasks'
export const SHEET_FOLDERS = 'folders'
export const SHEET_LABELS = 'labels'

// Task column indices (0-based)
export const TASK_COL = {
  ID: 0,
  PARENT_ID: 1,
  FOLDER_ID: 2,
  TITLE: 3,
  STATUS: 4,
  PRIORITY: 5,
  DEADLINE_DATE: 6,
  DEADLINE_TIME: 7,
  IS_RECURRING: 8,
  RECUR_TYPE: 9,
  RECUR_VALUE: 10,
  LABELS: 11,
  SORT_ORDER: 12,
  CREATED_AT: 13,
  UPDATED_AT: 14,
  COMPLETED_AT: 15,
  IS_EXPANDED: 16,
} as const

// Folder columns: id | name | color | sort_order
export const FOLDER_COL = {
  ID: 0,
  NAME: 1,
  COLOR: 2,
  SORT_ORDER: 3,
} as const

// Label columns: id | name | color | sort_order
export const LABEL_COL = {
  ID: 0,
  NAME: 1,
  COLOR: 2,
  SORT_ORDER: 3,
} as const

// Sheet ranges
export const TASK_RANGE = `${SHEET_TASKS}!A:Q`
export const FOLDER_RANGE = `${SHEET_FOLDERS}!A:D`
export const LABEL_RANGE = `${SHEET_LABELS}!A:D`

// Default label/folder colors
export const LABEL_COLOR_PRESETS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#6b7280',
]

// Special Inbox folder
export const INBOX_FOLDER_ID = 'fld-inbox'
