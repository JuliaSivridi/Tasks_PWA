# Stler Tasks — Technical Specification

**Version:** 1.0 · **April 2026**
**Repository:** github.com/JuliaSivridi/Tasks_PWA
**Stack:** React 19 · TypeScript 5 · Zustand 5 · Google Sheets API v4 · Dexie · Vite PWA

---

## 1. Overview

Stler Tasks is a personal task manager PWA. All user data lives in the user's own **Google Spreadsheet** named `db_tasks`, acting as a zero-cost serverless database. The app is fully offline-capable: edits queue locally (IndexedDB) and sync to Sheets when connectivity is restored.

**Key design decisions:**

- **Google Sheets as DB** — no backend to operate; data always owned by the user; free quota sufficient for personal use.
- **Offline-first** — every write goes to IndexedDB immediately; the offline queue flushes to Sheets asynchronously.
- **Optimistic UI** — in-memory Zustand state updates instantly; sync is fire-and-forget with last-write-wins conflict resolution via `updated_at`.
- **Single-user, no RBAC** — personal tool; XSS-tradeoff accepted: access token stored in localStorage for seamless page refresh.
- **PWA** — installable, standalone display mode, icon set, service worker caches the Sheets API (NetworkFirst, 10 s timeout).

---

## 2. Tech Stack

| Layer | Library | Version | Note |
|---|---|---|---|
| UI Framework | React | ^19.2.0 | Concurrent mode |
| Language | TypeScript | ~5.9.3 | Strict mode |
| Build | Vite | ^7.3.1 | ESM, path alias `@` |
| PWA | vite-plugin-pwa | ^1.2.0 | Workbox, autoUpdate |
| Styling | Tailwind CSS | ^3.4.19 | CSS custom properties theme |
| Components | Radix UI / shadcn | various | Headless primitives |
| Icons | lucide-react | ^0.575.0 | |
| State | Zustand | ^5.0.11 | `persist` middleware for auth |
| Local DB | Dexie (IndexedDB) | ^4.3.0 | 4 tables |
| Forms | react-hook-form + Zod | ^7.71.2 + ^4.3.6 | |
| Dates | date-fns | ^4.1.0 | |
| DnD | @dnd-kit | core^6.3.1, sortable^10 | Drag-to-reorder + reparent |
| Auth | Google Identity Services | — | Script injected at runtime |
| Remote API | Google Sheets API v4 | — | REST over fetch |
| Remote Search | Google Drive API v3 | — | Spreadsheet lookup |

---

## 3. Architecture

**Pattern:** Feature-sliced React SPA — no routing library (single page, view state in Zustand).

```
┌──────────────────────────────────────────────────────────────┐
│                        React UI Layer                        │
│  LoginPage · AppShell · Sidebar · TaskList · TaskItem · …   │
└────────────────────┬─────────────────────────────────────────┘
                     │ reads / dispatches
┌────────────────────▼─────────────────────────────────────────┐
│                      Zustand Stores                          │
│  authStore · tasksStore · foldersStore · labelsStore         │
│  uiStore · prefsStore · syncStore                            │
└──────┬──────────────────────┬────────────────────────────────┘
       │ persist (Dexie)      │ enqueue (offlineQueue)
┌──────▼──────┐        ┌──────▼──────────────────────────────┐
│  Dexie DB   │        │           syncService                │
│ (IndexedDB) │        │  scheduleFlush · flush · pull        │
└──────────────┘        └──────┬──────────────────────────────┘
                               │ HTTP REST
                  ┌────────────▼──────────────────────────────┐
                  │  Google Sheets API v4 + Drive API v3       │
                  │  spreadsheet: db_tasks                     │
                  └───────────────────────────────────────────┘
```

**Write path:**
1. User action → `tasksStore.addTask()` / `updateTask()` / etc.
2. Store writes to Dexie immediately (synchronous from user perspective)
3. Store calls `enqueue('task', 'create', id, payload)` → writes to `db.queue`
4. Store calls `scheduleFlush()` → debounced 800 ms timer
5. Timer fires → `flush()` sends queue to Sheets API
6. `flush()` deduplicates by `(entityType, entityId, operationType)`, keeping latest by `createdAt`

**Read path:**
1. On app init: `initialLoad()` → `flush()` → `pull()`
2. `pull()` fetches tasks/folders/labels in parallel from Sheets
3. Each store's `upsertMany()` merges into Dexie + memory (last-write-wins by `updated_at`)
4. On network reconnect: `fullSync()` = `flush()` + `pull()`
5. On app foreground (stale > 5 min): `fullSync()`

**Error handling:**
- Sheets API 401 → one silent token refresh + retry
- Queue item failure → `retryCount++`, max 5 retries; silently dropped after
- Init failure → fallback to Dexie-only (offline mode), `syncError` shown in sidebar

---

## 4. Package / Folder Structure

```
src/
├── App.tsx                   Auth gate: shows LoginPage or AppShell
├── main.tsx                  React entry, StrictMode
├── index.css                 Tailwind directives + CSS custom properties
│
├── api/
│   ├── sheetsClient.ts       Base fetch wrapper; token refresh; row-index cache
│   ├── tasksApi.ts           Tasks sheet CRUD (append / update / fetch)
│   ├── foldersApi.ts         Folders sheet CRUD
│   ├── labelsApi.ts          Labels sheet CRUD
│   ├── settingsApi.ts        Load/save prefs as JSON in settings!A1
│   └── spreadsheetSetup.ts   Find or create db_tasks spreadsheet on Drive
│
├── services/
│   ├── authService.ts        GIS script injection; token client init; userinfo fetch
│   ├── db.ts                 Dexie schema v1: 4 tables
│   ├── offlineQueue.ts       Dexie queue helpers: enqueue/getPending/markDone/markFailed
│   ├── syncService.ts        flush · pull · initialLoad · scheduleFlush · fullSync
│   └── recurrenceService.ts  getNextDueDate · createNextOccurrence
│
├── store/
│   ├── authStore.ts          User, token, spreadsheetId — persisted to localStorage
│   ├── tasksStore.ts         In-memory + Dexie tasks; CRUD; upsertMany
│   ├── foldersStore.ts       In-memory + Dexie folders; CRUD; ensureInbox
│   ├── labelsStore.ts        In-memory + Dexie labels; CRUD; sorted by sort_order
│   ├── uiStore.ts            selectedView, sidebarOpen, createTaskOpen
│   ├── prefsStore.ts         Sidebar section collapse state; saved to Sheets settings
│   └── syncStore.ts          isSyncing, isOnline, lastSyncAt, pendingCount, syncError
│
├── hooks/
│   ├── useTasks.ts           Derived view hooks: useUpcomingGroups, useAllTasks, etc.
│   └── useSync.ts            online/offline/visibilitychange/pagehide event listeners
│
├── types/
│   ├── task.ts               Task, TaskStatus, Priority, RecurType, TaskInput
│   ├── folder.ts             Folder, FolderInput
│   ├── label.ts              Label, LabelInput
│   ├── sheets.ts             Sheets API response types
│   └── sync.ts               QueueItem, EntityType, OperationType, QueueItemStatus
│
├── utils/
│   ├── constants.ts          Sheet names, column indices (TASK_COL, FOLDER_COL, LABEL_COL), INBOX_FOLDER_ID, LABEL_COLOR_PRESETS
│   ├── sheetsMapper.ts       rowToTask / taskToRow / rowToFolder / rowToLabel, etc.
│   ├── dateUtils.ts          formatTaskDeadlineLabel, formatDayGroupLabel, getDeadlineStatus, isOverdue, etc.
│   ├── uuid.ts               generateId(prefix) → 'tsk_xxxxxxxx'
│   └── lib/utils.ts          cn() (clsx + tailwind-merge)
│
└── components/
    ├── layout/
    │   ├── AppShell.tsx      Desktop aside + mobile Sheet drawer + Header + TaskList
    │   ├── Header.tsx        App title + hamburger (mobile) + user avatar dropdown
    │   ├── LoginPage.tsx     "Sign in with Google" centered card
    │   └── Sidebar.tsx       Nav links · Priorities · Labels · Folders · Sync footer
    ├── tasks/
    │   ├── TaskList.tsx      View dispatcher · FilterBar · WeekStrip · all view components
    │   ├── TaskItem.tsx      Two-row task row; priority/label pickers; subtask expand
    │   ├── TaskCreateModal.tsx  Create/edit form with @folder #label token parsing
    │   ├── TaskChildren.tsx  Subtask list with DnD reorder + reparent
    │   └── TimePickerDialog.tsx  Deadline date/time + recurrence UI
    ├── common/
    │   └── ConfirmDialog.tsx Generic confirmation modal
    └── ui/                   shadcn/Radix wrappers (button, input, dialog, select, …)
```

---

## 5. Data Model

### Task

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | generated | `tsk_` + 8 random hex chars |
| `parent_id` | `string` | `''` | ID of parent task; empty = root |
| `folder_id` | `string` | `INBOX_FOLDER_ID` | Folder assignment |
| `title` | `string` | required | Task text |
| `status` | `'pending' \| 'completed' \| 'deleted'` | `'pending'` | Soft-delete via 'deleted' |
| `priority` | `'urgent' \| 'important' \| 'normal'` | `'normal'` | Shown as flag color |
| `deadline_date` | `string` | `''` | ISO `YYYY-MM-DD` |
| `deadline_time` | `string` | `''` | `HH:MM` 24-hour |
| `is_recurring` | `boolean` | `false` | Recurring task flag |
| `recur_type` | `'days' \| 'weeks' \| 'months' \| ''` | `''` | Recurrence unit |
| `recur_value` | `number` | `1` | Recurrence interval (1–365) |
| `labels` | `string` | `''` | Comma-separated label IDs |
| `sort_order` | `number` | `0` | Manual sort; increments of 10 |
| `created_at` | `string` | `now()` | ISO 8601 timestamp |
| `updated_at` | `string` | `now()` | ISO 8601 timestamp; conflict key |
| `completed_at` | `string` | `''` | ISO 8601 or empty |
| `is_expanded` | `boolean` | `true` | UI subtask expand state |

**Notes:**
- Recurring tasks are never completed; checking one advances `deadline_date` by `recur_value recur_type`.
- `status = 'deleted'` records remain in Sheets for audit; excluded from UI queries.
- Subtasks: any depth allowed; `getChildren(parentId)` is used to render the tree.

---

### Folder

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | generated | `fld_` + 8 hex chars; Inbox = `fld-inbox` |
| `name` | `string` | required | Display name |
| `color` | `string` | `''` | Hex `#RRGGBB` |
| `sort_order` | `number` | `0` | Sidebar display order |

**Note:** Inbox (`id = 'fld-inbox'`) is always created on first launch and shown first in sidebar.

---

### Label

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | generated | `lbl_` + 8 hex chars |
| `name` | `string` | required | Display name |
| `color` | `string` | preset | Hex `#RRGGBB` |
| `sort_order` | `number` | `0` | Sidebar display order (column D in Sheets) |

---

### QueueItem (offline sync queue)

| Field | Type | Description |
|---|---|---|
| `localId` | `number?` | Dexie auto-increment PK |
| `entityType` | `'task' \| 'folder' \| 'label'` | Target entity |
| `operationType` | `'create' \| 'update' \| 'delete'` | Operation |
| `entityId` | `string` | The entity's `id` |
| `payload` | `Record<string, unknown>` | Full entity snapshot at time of enqueue |
| `createdAt` | `string` | ISO 8601; used for deduplication ordering |
| `status` | `'pending' \| 'processing' \| 'failed'` | Queue state |
| `retryCount` | `number` | Incremented on failure; max 5 |

---

## 6. Database / Storage Schema

### Google Sheets — `db_tasks` Spreadsheet

**Spreadsheet found or created** by `spreadsheetSetup.ts` on first app launch, stored in `authStore.spreadsheetId` (localStorage).

#### Sheet: `tasks` — range `tasks!A:Q`

| Col | Index | Column name | Format |
|---|---|---|---|
| A | 0 | `id` | text `tsk_xxxxxxxx` |
| B | 1 | `parent_id` | text or empty |
| C | 2 | `folder_id` | text or empty |
| D | 3 | `title` | text |
| E | 4 | `status` | `pending` / `completed` / `deleted` |
| F | 5 | `priority` | `urgent` / `important` / `normal` |
| G | 6 | `deadline_date` | `YYYY-MM-DD` or empty |
| H | 7 | `deadline_time` | `HH:MM` or empty |
| I | 8 | `is_recurring` | `TRUE` / `FALSE` |
| J | 9 | `recur_type` | `days` / `weeks` / `months` or empty |
| K | 10 | `recur_value` | numeric string `1`–`365` |
| L | 11 | `labels` | comma-separated IDs or empty |
| M | 12 | `sort_order` | numeric string `0`, `10`, `20`, … |
| N | 13 | `created_at` | ISO 8601 |
| O | 14 | `updated_at` | ISO 8601 |
| P | 15 | `completed_at` | ISO 8601 or empty |
| Q | 16 | `is_expanded` | `TRUE` / `FALSE` |

Row 1 is a header row: `id, parent_id, folder_id, title, status, priority, deadline_date, deadline_time, is_recurring, recur_type, recur_value, labels, sort_order, created_at, updated_at, completed_at, is_expanded`

#### Sheet: `folders` — range `folders!A:D`

| Col | Index | Column name | Format |
|---|---|---|---|
| A | 0 | `id` | `fld_xxxxxxxx` or `fld-inbox` |
| B | 1 | `name` | text |
| C | 2 | `color` | hex `#RRGGBB` or empty |
| D | 3 | `sort_order` | numeric string |

#### Sheet: `labels` — range `labels!A:D`

| Col | Index | Column name | Format |
|---|---|---|---|
| A | 0 | `id` | `lbl_xxxxxxxx` |
| B | 1 | `name` | text |
| C | 2 | `color` | hex `#RRGGBB` |
| D | 3 | `sort_order` | numeric string |

#### Sheet: `settings` — single cell `settings!A1`

Single JSON string. Example:
```json
{"sectionOpen":{"priorities":true,"folders":true,"labels":true}}
```

---

### Dexie IndexedDB — `TaskManagerDB` v1

| Table | Key | Indices |
|---|---|---|
| `tasks` | `&id` (unique) | `parent_id, folder_id, status, updated_at` |
| `folders` | `&id` (unique) | `parent_id` |
| `labels` | `&id` (unique) | — |
| `queue` | `++localId` (auto-inc) | `entityType, operationType, status, createdAt` |

### Token / Auth — `localStorage`

Key: `auth-storage` (Zustand persist). Fields saved: `user`, `accessToken`, `tokenExpiry` (ms epoch), `spreadsheetId`. `isAuthenticated` is **not** persisted — it is recomputed on init.

### Preferences — `settings!A1`

`prefsStore` loaded from Sheets on init; saved (1 000 ms debounced) on every section toggle. Fallback: in-memory defaults if sheet unavailable.

---

## 7. Authentication & First-Launch Setup

**OAuth 2.0 Implicit / Token Flow** via Google Identity Services (GIS).

**Scopes requested:**
- `email` `profile`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive.metadata.readonly`

**Step-by-step flow:**

```
1. App.tsx mounts → initAuth()
   ├─ Load GIS script (https://accounts.google.com/gsi/client)
   ├─ google.accounts.oauth2.initTokenClient({ client_id, scope, login_hint, callback })
   └─ setTokenClient(client)

2. Session restore check (no UI shown yet):
   ├─ localStorage token still valid (now < tokenExpiry − 60 s)?
   │   └─ Restore session without network call → show AppShell
   ├─ Token expired but user known?
   │   └─ refreshToken() → tokenClient.requestAccessToken({ prompt: '' })
   │       ├─ GIS grants silently → callback fires → resolveTokenRequest() → AppShell
   │       └─ GIS fails silently → show LoginPage
   └─ No user in localStorage → show LoginPage

3. User clicks "Sign in with Google" (LoginPage):
   └─ refreshToken() → tokenClient.requestAccessToken({ prompt: '' })
       └─ Google consent dialog (first time) → callback fires

4. GIS callback:
   ├─ Error: rejectTokenRequest(error)
   └─ Success:
       ├─ resolveTokenRequest(access_token, expires_in)
       │   └─ setToken() → stores token + tokenExpiry = now + expiresIn*1000
       └─ Fetch https://www.googleapis.com/oauth2/v3/userinfo
           └─ setUser({ name, email, picture })

5. isAuthenticated = true → AppShell renders

6. AppShell.useEffect():
   ├─ ensureSpreadsheet()  — find or create "db_tasks" spreadsheet
   ├─ initialLoad()        — ensure headers; flush; pull; ensureInbox
   └─ prefsStore.load()    — fetch settings!A1

7. useSync() hook activates:
   └─ Registers: online/offline/pagehide/visibilitychange listeners
```

**Token refresh in sheetsClient:** Before every Sheets API call — if `Date.now() > tokenExpiry − 60_000`, call `refreshToken()` first. On HTTP 401 response: one silent refresh + retry.

**Logout:** Revoke token via `google.accounts.oauth2.revoke(token)`, clear Zustand state + localStorage.

**First-launch spreadsheet setup** (`spreadsheetSetup.ts`):
1. If `authStore.spreadsheetId` is non-empty → done.
2. Drive API: `GET /drive/v3/files?q=name='db_tasks' and mimeType='application/vnd.google-apps.spreadsheet'`
3. Found: save first result's ID.
4. Not found: `POST /spreadsheets` with body declaring 4 sheets (tasks, folders, labels, settings).
5. Save created spreadsheet's ID to `authStore.setSpreadsheetId()`.

---

## 8. Synchronization / API Layer

### Sheets API Client (`sheetsClient.ts`)

Base URL: `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/`

**Row-index cache:** A `Map<string, number>` caches `entityId → sheetRowNumber` to avoid re-fetching column A on every update. Invalidated after every flush (`invalidateRowCache()`).

**`findRowIndex(sheet, entityId)`**: fetches `{sheet}!A:A`, scans for entityId, returns 1-based row number or `null`.

**`sheetsRequest<T>(method, path, body?)`**: sets `Authorization: Bearer {token}`; refreshes token proactively; on 401 retries once after refresh.

### Offline Queue (`offlineQueue.ts`)

```typescript
enqueue(entityType, operationType, entityId, payload):
  db.queue.add({
    entityType, operationType, entityId,
    payload,
    createdAt: now(),
    status: 'pending',
    retryCount: 0,
  })

getPending():
  db.queue.where('status').anyOf(['pending', 'failed'])
          .and(item => item.retryCount < 5).toArray()

markProcessing(localId): db.queue.update(localId, { status: 'processing' })
markDone(localId):       db.queue.delete(localId)
markFailed(localId, n):  db.queue.update(localId, { status: 'failed', retryCount: n })
getQueueLength():        db.queue.where('status').anyOf(['pending','failed']).count()
```

### Sync Service (`syncService.ts`)

**`flush()`:**
```
1. items = getPending()
2. if items.length === 0: return
3. Deduplicate: Map<"entityType:entityId:operationType" → latest item by createdAt>
4. For superseded items: markDone(localId)
5. For each latest item:
   a. markProcessing(localId)
   b. processQueueItem(item):
      task create  → appendTask
      task update  → apiUpdateTask
      task delete  → apiUpdateTask({ ...task, status: 'deleted' })
      folder create → appendFolder
      folder update → apiUpdateFolder
      label create  → appendLabel
      label update  → apiUpdateLabel
   c. markDone(localId)
   d. on error: markFailed(localId, retryCount+1)
6. invalidateRowCache()
7. syncStore.setPendingCount(getQueueLength())
```

**`pull()`:**
```
[tasks, folders, labels] = await Promise.all([
  fetchAllTasks(), fetchAllFolders(), fetchAllLabels()
])
await Promise.all([
  tasksStore.upsertMany(tasks),
  foldersStore.upsertMany(folders),
  labelsStore.upsertMany(labels),
])
syncStore.setLastSyncAt(now())
```

**`scheduleFlush()`** — debounced 800 ms; clears previous timer on each call; guards `_flushing` flag to prevent concurrent flushes.

**`fullSync()`** — guards `isSyncing`; sets syncing flag; calls `flush()` → `pull()`; catches error to `syncError`.

**`initialLoad()`** — on AppShell mount; sets `isSyncing`; runs `ensureHeader` × 3 in parallel; then `flush()` → `pull()`; on error falls back to Dexie-only; always runs `ensureInbox()`.

**Conflict resolution (upsertMany):** For each incoming entity, if local Dexie record has newer `updated_at`, keep local. Otherwise overwrite with remote. Implemented as a `bulkPut` after filtering — last-write-wins.

**Sync triggers:**

| Event | Action |
|---|---|
| User edit | `scheduleFlush()` (debounced 800 ms) |
| Task complete (non-recurring) | `flush()` immediately |
| Tab/window hidden (`pagehide`) | `flush()` immediately |
| `visibilitychange` → hidden | `flush()` immediately |
| `visibilitychange` → visible, stale > 5 min | `fullSync()` |
| `window.online` event | `fullSync()` |
| Manual sidebar button | `fullSync()` |

---

## 9. Screens / Pages

### View Routing

`uiStore.selectedView` determines which component renders inside `<main>`. No URL router; state is ephemeral (lost on refresh — user always starts at `'upcoming'`).

| `selectedView` | Component | `uiStore` fields used |
|---|---|---|
| `'upcoming'` | `UpcomingView` | — |
| `'all'` | `AllTasksView` | — |
| `'folder'` | `FolderView` | `selectedFolderId` |
| `'label'` | `LabelView` | `selectedLabelId` |
| `'priority'` | `PriorityView` | `selectedPriority` |
| `'completed'` | `CompletedView` | — |

---

### Upcoming View

**Hook:** `useUpcomingGroups()` — groups pending tasks that have a deadline by date.

**Layout:** WeekStrip (7-day nav) → FilterBar → scrollable day groups.

**Day groups:**
- `Overdue`: tasks with `deadline_date` < today — shown first, red header.
- `YYYY-MM-DD` keys: one group per future date — neutral `text-muted-foreground` header.
- Header format: `"16 Apr · Thursday · Today"` / `"18 Apr · Saturday"`.
- Within each group: tasks sorted by `deadline_time` (tasks without time sort last via `'99:99'`).

**TaskItem props:** `showFolder=true`, `hideChildren=true`, `hideDeadline=true` (shows time only if set, since date is in group header).

**WeekStrip behavior:**
- `IntersectionObserver` watches `[data-date="..."]` elements — updates `activeDate` as user scrolls.
- `weekOffset` auto-advances when `activeDate` crosses week boundary.
- Calendar icon button scrolls to today's group (or nearest upcoming).

**Filter logic (FilterBar):** OR within each category, AND between categories:
```
show task if:
  (priorityFilter.length === 0 OR task.priority IN priorityFilter) AND
  (labelFilter.length === 0 OR ANY labelFilter ID IN task.labels.split(',')) AND
  (folderFilter.length === 0 OR task.folder_id IN folderFilter)
```

---

### All Tasks View

**Hook:** `useAllTasks()` — all pending tasks.

**Sort:** priority asc (`urgent=0, important=1, normal=2`) → deadline date asc (nulls last) → deadline time asc (nulls last as `'99:99'`) → `created_at` asc.

**FilterBar:** all 3 filters active.

**TaskItem props:** `showFolder=true`, `hideChildren=true`.

---

### Folder View

**Hook:** `useFilteredRootTasks()` — pending root tasks (`parent_id = ''`) in `selectedFolderId`.

**Inbox handling:** Tasks with `folder_id = ''` are also shown when Inbox is selected.

**Drag-and-drop (dnd-kit):**
- Vertical reorder → updates `sort_order` in increments of 10 for all reordered items.
- Drag-right (delta.x > 50 px) → reparents dragged task under hovered task (`parent_id = targetId`).
- `scheduleFlush()` after any drag end.

**TaskItem props:** `showFolder=false`, `hideChildren=false` (subtasks shown inline).

---

### Label View

**Hook:** `useLabelTasks()` — pending tasks containing `selectedLabelId` in `task.labels`.

**Sort:** same as All Tasks (priority → deadline+time → created_at).

**TaskItem props:** `showFolder=true`, `hideChildren=true`, `hideLabels=true` (label already implied by view).

---

### Priority View

**Hook:** `usePriorityTasks()` — pending tasks with `task.priority === selectedPriority`.

**Sort:** deadline date → deadline time → created_at.

**TaskItem props:** `showFolder=true`, `hideChildren=true`.

---

### Completed View

**Hook:** `useCompletedTasks()` — tasks with `status = 'completed'`, sorted by `completed_at` desc (falls back to `updated_at`).

**FilterBar:** all 3 filters.

**Per-task row:** RotateCcw button (unrevert to pending) · title (line-through) · completion time · labels (Tag icon in label color) · folder (Folder icon in folder color) · Trash button (soft-delete).

---

## 10. Key Components

### TaskItem

```typescript
interface Props {
  task: Task
  depth: number           // 0 = root; 1+ = subtask (paddingLeft = depth * 20px)
  showFolder?: boolean    // Show folder in row 2
  hideChildren?: boolean  // Don't render subtasks below
  hideDeadline?: boolean  // Hide date; show only deadline_time if present
  hideLabels?: boolean    // Omit label chips from row 2
}
```

**Row 1:** `[expand toggle | 20px] [Checkbox] [Title flex-1] [Clock] [Flag] [Tag] [+] [Pencil] [Trash]`
- Desktop (md+): all icons visible.
- Mobile: Clock + MoreHorizontal (DropdownMenu with submenus for Priority, Labels).

**Row 2** (rendered only when content exists):
`[RefreshCw?] [deadline/time] [Label chips] [Folder icon+name] [✓ N / ○ N / ≡ N]`

Subtask counter icons: `Check` (completed) · `Circle` (pending) · `List` (total).

**Deadline color classes:**

| Status | Class |
|---|---|
| `overdue` | `text-red-400` |
| `today` | `text-green-600` |
| `tomorrow` | `text-orange-400` |
| `week` (2–7 days) | `text-violet-400` |
| `future` | `text-muted-foreground` |

---

### TaskCreateModal

**Props:** `open`, `editing?: Task`, `parentId?: string`, `onClose`.

**Field order:** Title → Due date + Time → `[ ] Repeat  every [N] [days/weeks/months]` → Priority → Labels → Folder.

**Title token parsing:** Inline `@FolderName` → resolves to folder ID; `#LabelName` → adds label ID. Tokens stripped from stored title.

**Inline label creation:** "New" button → color picker (8 presets) + name input + OK/✕. Created label immediately added to task.

**Folder selector:** Select dropdown; all folders shown with colored Folder icon + name.

**Default folder:** `selectedFolderId` if in folder view; otherwise `INBOX_FOLDER_ID`.

---

### TimePickerDialog

**Props:** `open`, `task: Task`, `onClose`.

**Fields:** Date input · Time input · `[ ] Repeat  every [N] [days/weeks/months]` (all on one line when checked).

**Buttons:**
- `Clear` (shown only if date set) → clears deadline + recurring fields.
- `Postpone` (shown if recurring + deadline) → advances date via `getNextDueDate()`.
- `Cancel` · `Save`.

---

### FilterBar

Three `DropdownMenu` buttons (Flag / Tag / Folder icon). Each dropdown uses `onSelect={(e) => e.preventDefault()}` to keep menu open for multi-select. Active filter highlights button with `bg-accent`. Folder filter includes all folders (Inbox + named).

---

### WeekStrip

7 day columns between prev/next arrows and a calendar-icon today button. Each day cell:
- Large number (day of month)
- Single letter (EEEEE format: M/T/W/T/F/S/S)
- Dot: green if today, primary-color if has tasks, transparent otherwise.

Today button border highlights when `weekOffset === 0`.

---

### Sidebar

**Layout (top to bottom):**
1. `Add task` primary button
2. Navigation rows: Upcoming · All tasks · Completed
3. **Priorities** section (collapsible): Urgent · Important · Normal
4. **Labels** section (collapsible, above Folders): sorted by `sort_order`; each row has colored Tag icon, name, and `…` dropdown (Edit / Delete)
5. **Folders** section (collapsible): Inbox always first; then sorted by `sort_order`; each row has colored Folder icon, name, and `…` dropdown (Edit / Delete)
6. Footer: RefreshCw sync button + "Synced HH:MM" / "Syncing…" status

**Collapse state:** Stored in `prefsStore.sectionOpen[key]`; saved to `settings!A1` (1 000 ms debounced).

**ItemFormModal** (shared for folder + label create/edit): name input + 8-color picker + Cancel/Save.

---

## 11. Theme & Colors

CSS custom properties in `src/index.css`. Tailwind maps `bg-background`, `text-foreground`, etc. to these variables.

| Token | Light hex | Dark hex | Usage |
|---|---|---|---|
| `--background` | `#ffffff` | `#1c1c1c` | Page background |
| `--foreground` | `#1a1a29` | `#f2f2f2` | Default text |
| `--card` | `#ffffff` | `#363636` | Card surfaces |
| `--popover` | `#ffffff` | `#242424` | Dropdowns, dialogs |
| `--primary` | `#e07e38` | `#e89555` | Buttons, active items, icons |
| `--primary-foreground` | `#ffffff` | `#ffffff` | Text on primary |
| `--secondary` | `#f2f0ed` | `#363636` | Secondary buttons |
| `--muted` | `#f2f0ed` | `#363636` | Muted backgrounds |
| `--muted-foreground` | `#6b6b6b` | `#949494` | Placeholder, subtitles |
| `--accent` | `#fffbf2` | `#2e2e2e` | Hover states |
| `--accent-foreground` | `#9d4415` | `#f2f2f2` | Text on accent |
| `--destructive` | `#ff6b6b` | `#e85c5c` | Delete, error |
| `--border` | `#e0e0e0` | `#4a4a4a` | Dividers, inputs |
| `--input` | `#e0e0e0` | `#383838` | Input borders |
| `--ring` | `#e07e38` | `#e89555` | Focus ring |
| `--radius` | `0.5rem` | — | Border radius |

**Deadline status colors (hardcoded Tailwind):**

| Status | Color | Class |
|---|---|---|
| Overdue | `#f87171` | `text-red-400` |
| Today | `#16a34a` | `text-green-600` |
| Tomorrow | `#fb923c` | `text-orange-400` |
| This week (2–7 d) | `#a78bfa` | `text-violet-400` |

**Priority colors (hardcoded):**

| Priority | Color |
|---|---|
| Urgent | `#f87171` |
| Important | `#fb923c` |
| Normal | `#9ca3af` |

**Label color presets (8 options):**
`#ef4444` · `#f97316` · `#eab308` · `#22c55e` · `#06b6d4` · `#3b82f6` · `#8b5cf6` · `#6b7280`

---

## 12. Navigation & Deeplinks

No URL router. All navigation is Zustand state mutations (`uiStore.setView()`).

| `setView()` call | `selectedView` | Auxiliary state set |
|---|---|---|
| `setView('upcoming')` | `'upcoming'` | clears folder/label/priority |
| `setView('all')` | `'all'` | clears folder/label/priority |
| `setView('folder', id)` | `'folder'` | `selectedFolderId = id` |
| `setView('label', id)` | `'label'` | `selectedLabelId = id` |
| `setView('priority', id)` | `'priority'` | `selectedPriority = id` |
| `setView('completed')` | `'completed'` | clears folder/label/priority |

**Mobile sidebar:** Closes (`setSidebarOpen(false)`) after every `setView()` call (wrapped in `goTo()` in Sidebar.tsx).

**No deeplinks / URL routing.** Starting URL always loads the `'upcoming'` view.

---

## 13. CI/CD & Build

No CI pipeline configured. Manual local build + Vercel deploy.

**Build:**
```bash
npm run build        # tsc -b && vite build → dist/
npm run dev          # Vite dev server at localhost:5173
npm run preview      # Preview dist/ at localhost:4173
npm run lint         # ESLint (eslint .)
```

**Vercel:**
- Framework: Vite (auto-detected)
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable required: `VITE_GOOGLE_CLIENT_ID`

---

## 14. First-Time Developer Setup

```bash
# 1. Clone
git clone https://github.com/JuliaSivridi/Tasks_PWA.git
cd Tasks_PWA

# 2. Install dependencies
npm install

# 3. Google Cloud Console setup
#    a. Create project → Enable "Google Sheets API" + "Google Drive API"
#    b. Create OAuth 2.0 Client ID (Web Application)
#    c. Authorized JS origins: http://localhost:5173
#    d. Copy Client ID

# 4. Create .env.local
echo "VITE_GOOGLE_CLIENT_ID=your_client_id_here" > .env.local

# 5. Run dev server
npm run dev
# → App opens at http://localhost:5173
# → Sign in with Google → db_tasks spreadsheet auto-created in your Drive

# 6. Build for production
npm run build
# → dist/ ready to deploy

# 7. Vercel deploy (first time)
npx vercel --prod
# Set VITE_GOOGLE_CLIENT_ID env var in Vercel dashboard
# Add https://your-app.vercel.app to Authorized JS origins in Google Console
```

**TypeScript path alias:** `@` → `src/` (configured in `vite.config.ts` + `tsconfig.json`).

---

## 15. Key Algorithms

### ID Generation

```
generateId(prefix: string): string
  random = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return `${prefix}_${random}`
  // → 'tsk_a3f8c912'
```

### Deadline Status Classification

```
getDeadlineStatus(deadlineDate, deadlineTime?): DeadlineStatus
  date = parseISO(deadlineDate)
  today = startOfDay(now)
  if date < today:                 return 'overdue'
  if date === today:
    if deadlineTime:
      deadline = today + HH:MM
      if deadline < now():         return 'overdue'
    return 'today'
  if date === tomorrow:            return 'tomorrow'
  diff = differenceInCalendarDays(date, today)
  if diff <= 7:                    return 'week'
  return 'future'
```

### Upcoming Group Builder

```
useUpcomingGroups(): TaskGroup[]
  pending = tasks.filter(status='pending' AND deadline_date ≠ '')
  sorted = pending.sortBy(deadline_date ASC)
  today = startOfDay(now)
  groups = Map<key, TaskGroup>

  for task in sorted:
    isOver = date < today
    key = isOver ? 'overdue' : task.deadline_date
    if key not in groups:
      groups[key] = {
        label: isOver ? 'Overdue' : formatDayGroupLabel(key),
        isOverdue: isOver,
        isToday: !isOver AND key === todayStr,
        isTomorrow: !isOver AND isTomorrow(date),
        tasks: []
      }
    groups[key].tasks.push(task)

  result = groups.values().sortBy(isOverdue DESC, key ASC)
  for group in result:
    group.tasks.sortBy(deadline_time || '99:99' ASC)
  return result
```

### Recurring Task Completion

```
handleComplete(task):
  if task.is_recurring AND task.deadline_date:
    nextDate = getNextDueDate(task)  // addDays/Weeks/Months by recur_value
    if nextDate:
      updateTask(task.id, { deadline_date: nextDate })
      flush()   // immediate, not debounced
  else:
    completeTask(task.id)
    // completeTask also completes all pending subtasks recursively
```

### Flush Deduplication

```
flush():
  items = getPending()   // status in ['pending','failed'], retryCount < 5
  latestMap = {}
  for item in items:
    key = item.entityType + ':' + item.entityId + ':' + item.operationType
    if key not in latestMap OR item.createdAt > latestMap[key].createdAt:
      latestMap[key] = item

  // Discard older duplicates
  for item in items:
    if item.localId NOT IN latestMap.values:
      markDone(item.localId)

  // Send only latest per key
  for item in latestMap.values:
    markProcessing → processQueueItem → markDone | markFailed
```

### Day Group Label Format

```
formatDayGroupLabel(dateStr):
  date = parseISO(dateStr)
  base = format(date, 'd MMM') + ' · ' + format(date, 'EEEE')
  if isToday(date):    return base + ' · Today'
  if isTomorrow(date): return base + ' · Tomorrow'
  return base
  // → "16 Apr · Thursday · Today" / "18 Apr · Saturday"
```

### DnD Reorder + Reparent

```
handleDragEnd(active, over, delta):
  if not over OR active === over: return
  if delta.x > 50:
    // Reparent: make dragged task a subtask of hovered task
    updateTask(active.id, { parent_id: over.id })
    scheduleFlush()
    return
  // Reorder: swap positions
  reordered = arrayMove(localTasks, oldIndex, newIndex)
  for i, task in reordered:
    updateTask(task.id, { sort_order: i * 10 })
  scheduleFlush()
```
