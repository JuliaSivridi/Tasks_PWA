import { format, addDays } from 'date-fns'
import { sheetsRequest } from './sheetsClient'
import { now } from '@/utils/dateUtils'
import { INBOX_FOLDER_ID } from '@/utils/constants'

// ── Static IDs ────────────────────────────────────────────────────────────────

const WORK_ID     = 'fld-work'
const PERSONAL_ID = 'fld-personal'
const LABEL_REVIEW = 'lbl-review'
const LABEL_IDEA   = 'lbl-idea'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a 17-element task row matching tasksApi HEADER order. */
function taskRow(
  id: string,
  folderId: string,
  title: string,
  priority: string,
  deadlineDate: string,
  labels: string,
  sortOrder: number,
  ts: string,
): string[] {
  return [
    id,          // A id
    '',          // B parent_id
    folderId,    // C folder_id
    title,       // D title
    'pending',   // E status
    priority,    // F priority
    deadlineDate,// G deadline_date
    '',          // H deadline_time
    'FALSE',     // I is_recurring
    '',          // J recur_type
    '0',         // K recur_value
    labels,      // L labels
    String(sortOrder), // M sort_order
    ts,          // N created_at
    ts,          // O updated_at
    '',          // P completed_at
    'TRUE',      // Q is_expanded
  ]
}

/** Build a 4-element folder/label row. */
function entityRow(id: string, name: string, color: string, sortOrder: number): string[] {
  return [id, name, color, String(sortOrder)]
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Seeds a freshly created "db_tasks" spreadsheet with sample folders, labels,
 * and tasks so a new user sees a useful starting state on first run.
 *
 * Called once, right after ensureSpreadsheet() returns { isNew: true },
 * before initialLoad(). Works by writing directly to Sheets via batchUpdate —
 * the same pattern as Words-PWA.
 */
export async function seedOnboarding(): Promise<void> {
  const ts = now()
  const deadline5 = format(addDays(new Date(), 5), 'yyyy-MM-dd')

  // ── Tasks header + 5 sample rows ───────────────────────────────────────────
  const taskHeader = [
    'id','parent_id','folder_id','title','status','priority',
    'deadline_date','deadline_time','is_recurring','recur_type','recur_value',
    'labels','sort_order','created_at','updated_at','completed_at','is_expanded',
  ]
  const taskRows = [
    taskRow('tsk-seed-1', WORK_ID,       'Make important call',           'important', '',         '',            1, ts),
    taskRow('tsk-seed-2', WORK_ID,       'Review project draft',          'normal',    '',         LABEL_REVIEW,  2, ts),
    taskRow('tsk-seed-3', PERSONAL_ID,   'Buy groceries',                 'urgent',    '',         '',            3, ts),
    taskRow('tsk-seed-4', PERSONAL_ID,   'Schedule dentist appointment',  'normal',    deadline5,  '',            4, ts),
    taskRow('tsk-seed-5', INBOX_FOLDER_ID, 'Plan the week',               'normal',    '',         LABEL_IDEA,    5, ts),
  ]

  // ── Folder header + 2 sample folders ───────────────────────────────────────
  const folderHeader = ['id', 'name', 'color', 'sort_order']
  const folderRows = [
    entityRow(WORK_ID,     'Work',     '#4A90D9', 1),
    entityRow(PERSONAL_ID, 'Personal', '#7ED321', 2),
  ]

  // ── Label header + 2 sample labels ─────────────────────────────────────────
  const labelHeader = ['id', 'name', 'color', 'sort_order']
  const labelRows = [
    entityRow(LABEL_REVIEW, 'Review', '#F5A623', 1),
    entityRow(LABEL_IDEA,   'Idea',   '#9B59B6', 2),
  ]

  await sheetsRequest('POST', 'values:batchUpdate', {
    valueInputOption: 'RAW',
    data: [
      { range: 'tasks!A1:Q1',    values: [taskHeader] },
      { range: 'tasks!A2:Q6',    values: taskRows },
      { range: 'folders!A1:D1',  values: [folderHeader] },
      { range: 'folders!A2:D3',  values: folderRows },
      { range: 'labels!A1:D1',   values: [labelHeader] },
      { range: 'labels!A2:D3',   values: labelRows },
    ],
  })
}
