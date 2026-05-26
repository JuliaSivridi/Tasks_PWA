# Tasks PWA — Technical Specification

> Version 0.0.0 · Branch: main · Generated: 2026-05-27

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Package / Folder Structure](#4-package--folder-structure)
5. [Data Model](#5-data-model)
6. [Database / Storage Schema](#6-database--storage-schema)
7. [Authentication & First-Launch Setup](#7-authentication--first-launch-setup)
8. [Synchronization / API Layer](#8-synchronization--api-layer)
9. [UI Screens](#9-ui-screens)
10. [Key Components](#10-key-components)
11. [Theme & Colors](#11-theme--colors)
12. [Navigation & Deeplinks](#12-navigation--deeplinks)
13. [Loading & Empty States](#13-loading--empty-states)
14. [CI/CD & Build](#14-cicd--build)
15. [First-Time Setup (New Developer)](#15-first-time-setup-new-developer)
16. [Key Algorithms](#16-key-algorithms)

---

## 1. Overview

Tasks PWA is a personal task manager that stores all data in the user's own Google Sheets spreadsheet. The app is built as a Progressive Web App (PWA) with full offline support: every write is persisted locally in IndexedDB (via Dexie) and queued for sync. When the device is online the queue is flushed to Google Sheets; on the next open the latest state is pulled back from Sheets.

**Key design decisions:**

- **Google Sheets as the database.** There is no proprietary backend. All task, folder, and label data lives in a single `db_tasks` spreadsheet in the user's own Google Drive. Users can read and edit the spreadsheet directly.
- **Offline-first.** Every mutation writes to Dexie first, then enqueues a Sheets operation. The UI reads only from in-memory Zustand state seeded from Dexie. There is no blocking network call on any user action.
- **Last-write-wins conflict resolution.** When pulling from Sheets, `updated_at` timestamps are compared per entity; the newer record wins.
- **Calendar integration is opt-in.** Google Calendar events are fetched separately via the Calendar API and merged into task views. This feature requires additional OAuth scope (`https://www.googleapis.com/auth/calendar`) and is enabled per user in Settings.
- **No router.** Views are switched by a Zustand `uiStore` (`SelectedView` union type). The URL never changes.
- **Token persistence in localStorage.** The GIS OAuth2 token is stored in `localStorage` (key `auth-storage`) to avoid prompting on every page load. This is an acknowledged XSS trade-off noted in the code.

This spec covers everything that can be confirmed by reading the source code.

---

## 2. Tech Stack

| Layer | Library | Version | Notes |
|---|---|---|---|
| UI framework | React | ^19.2.0 | StrictMode, react-dom |
| Build tool | Vite | ^7.3.1 | `@vitejs/plugin-react` |
| PWA | vite-plugin-pwa | ^1.2.0 | Workbox, autoUpdate |
| TypeScript | typescript | ~5.9.3 | ES2022 target, strict |
| Styling | Tailwind CSS | ^3.4.19 | darkMode: 'media' |
| Tailwind plugin | tailwindcss-animate | ^1.0.7 | |
| State management | Zustand | ^5.0.11 | persist middleware for authStore |
| Local DB | Dexie | ^4.3.0 | IndexedDB wrapper, 2 schema versions |
| Server-side data | Google Sheets API v4 | — | direct fetch, no SDK |
| Auth | Google Identity Services (GIS) | — | `@react-oauth/google` ^0.13.4, token client flow |
| Calendar | Google Calendar API v3 | — | direct fetch |
| Drive | Google Drive API v3 | — | file search only |
| Forms | react-hook-form | ^7.71.2 | + zod ^4.3.6 + @hookform/resolvers ^5.2.2 |
| DnD | @dnd-kit/core | ^6.3.1 | + sortable ^10.0.0 + utilities ^3.2.2 |
| Date utilities | date-fns | ^4.1.0 | |
| Date picker | react-day-picker | ^9.14.0 | |
| UI primitives | Radix UI | various | checkbox, dialog, dropdown-menu, label, popover, scroll-area, select, separator, slot, tooltip |
| Icons | lucide-react | ^0.575.0 | |
| CSS utilities | clsx ^2.1.1, tailwind-merge ^3.5.0, class-variance-authority ^0.7.1 | | |
| Dev: lint | eslint ^9.39.1, eslint-plugin-react-hooks ^7.0.1, eslint-plugin-react-refresh ^0.4.24 | | |

---

## 3. Architecture

### Pattern

**Offline-first PWA with Google Sheets as remote storage.**

```
Browser
  │
  ├── React UI (components + Zustand stores)
  │     reads from: in-memory Zustand state
  │     writes via: store actions → Dexie + offlineQueue
  │
  ├── Dexie / IndexedDB  (persistent local cache)
  │
  ├── Offline Queue (Dexie `queue` table)
  │     flushed by syncService.flush()
  │
  └── Google APIs (online only)
        ├── Sheets API v4   — tasks / folders / labels CRUD
        ├── Calendar API v3 — events read + write
        └── Drive API v3    — spreadsheet search
```

### Data-flow diagram

```
User action
    │
    ▼
Zustand store action
    │── 1. db.tasks.put(task)         ← Dexie write (immediate)
    │── 2. enqueue('task','update',…)  ← queue table
    │── 3. set({ tasks: [...] })       ← in-memory update
    └── 4. scheduleFlush() (800 ms debounce)
                │
                ▼
           syncService.flush()
                │── dedup by (entityType, entityId, operationType)
                │── Sheets API write (append/update row)
                └── invalidateRowCache()

Pull (on load / online / every 5 min visibility):
    Sheets API GET → upsertMany() → Dexie bulkPut → Zustand set
```

### Write path (step-by-step)

1. User triggers a mutation (e.g., `addTask`, `updateTask`, `deleteTask`).
2. The Zustand store action builds the updated entity with a new `updated_at = now()`.
3. `db.tasks.put(entity)` — synchronous IndexedDB write via Dexie.
4. `enqueue('task', operationType, entityId, payload)` — inserts a `QueueItem` row into `db.queue` with `status: 'pending'`.
5. `set(...)` — updates the in-memory Zustand state; UI re-renders immediately.
6. `scheduleFlush()` — debounced 800 ms timer; calling it resets the timer.
7. `flush()` runs: reads all `pending | failed` queue items with `retryCount < 5`, deduplicates by `(entityType, entityId, operationType)` keeping the most recent `createdAt`, calls the appropriate Sheets API function, then `markDone(localId)` (deletes the row) or `markFailed(localId, retryCount+1)`.
8. `invalidateRowCache()` — clears the in-memory `entityId → sheet row number` cache so the next update re-discovers the row.

**Exception for `completeTask`:** flushes immediately (no debounce) by calling `flush()` directly.  
**Exception for recurring task completion:** does not call `completeTask`; instead calls `updateTask` with the next `deadline_date` computed by `recurrenceService.getNextDueDate()`, then flushes immediately.

### Read path

1. On app start (`AppShell` mount): `ensureSpreadsheet()` → (if new) `seedOnboarding()` → `initialLoad()`.
2. `initialLoad()`: calls `ensureHeader()` on all sheets, then `flush()`, then `pull()`, then `pullCalendar()`.
3. `pull()`: fetches all tasks, folders, labels in parallel from Sheets; calls `upsertMany()` on each store.
4. `upsertMany()` (tasks): conflict resolution — for each incoming entity, compare `updated_at` with the local Dexie record; keep the newer. Then `db.tasks.bulkPut(toStore)`.
5. After `initialLoad()`: `usePrefsStore.load()` — reads `settings!A1` JSON from Sheets.
6. `useSync` hook: registers `window.addEventListener('online')` → `fullSync()`, `visibilitychange` → `fullSync()` if stale > 5 min, `pagehide` → `flush()`.

### Error handling

- Any Sheets API `401` response triggers a silent token refresh (one retry). A second 401 surfaces an error.
- `initialLoad` catches all errors: sets `syncError` in `syncStore`, falls back to `loadFromDb()` from Dexie for all three stores.
- Calendar sync errors fall back to `calStore.loadFromDb()`.
- Queue items that fail are marked `status: 'failed'` with `retryCount++`. Items with `retryCount >= 5` are excluded from `getPending()` and not retried.
- Settings save failures are silently ignored (non-critical).

---

## 4. Package / Folder Structure

```
Tasks-PWA/
├── index.html                  HTML entry point
├── package.json
├── vite.config.ts              Vite + PWA plugin config
├── tsconfig.app.json           TypeScript config (ES2022, strict)
├── tailwind.config.js          Tailwind + custom CSS tokens
├── .env.example                VITE_GOOGLE_CLIENT_ID, VITE_FEEDBACK_URL
├── public/
│   └── icons/                  PWA icons (192, 512px)
├── docs/
│   ├── tech-spec.md            This file
│   ├── tech-spec.html          HTML version
│   └── tech-spec-example.css  CSS used by HTML spec
└── src/
    ├── main.tsx                React root mount
    ├── App.tsx                 Auth gate — AppShell vs LoginPage
    ├── index.css               Tailwind + CSS custom properties
    ├── types/
    │   ├── task.ts             Task, TaskInput, TaskStatus, Priority, RecurType
    │   ├── folder.ts           Folder, FolderInput
    │   ├── label.ts            Label, LabelInput
    │   ├── calendarEvent.ts    CalendarEvent, CalendarItem, DTOs
    │   ├── sheets.ts           ValueRange, SheetsGetResponse, etc.
    │   └── sync.ts             QueueItem, EntityType, OperationType
    ├── utils/
    │   ├── constants.ts        Sheet names, column indices, ranges, INBOX_FOLDER_ID
    │   ├── sheetsMapper.ts     rowToTask/taskToRow, rowToFolder/folderToRow, etc.
    │   ├── dateUtils.ts        now(), todayISO(), getDeadlineStatus(), formatDeadline(), etc.
    │   ├── rrule.ts            buildRRule(), parseRRule(), monthlyOptions()
    │   ├── uuid.ts             generateId(prefix) via crypto.randomUUID()
    │   ├── smartTitle.ts       parseSmartTitle() — @Folder #Label !1/2/3 tokens
    │   └── calendarDateTime.ts buildEventDateTime(), buildEndDateTime(), parseEventDateTimeFromDto()
    ├── services/
    │   ├── db.ts               Dexie schema (TaskManagerDB, versions 1+2)
    │   ├── authService.ts      initAuth(), GIS script loader
    │   ├── syncService.ts      flush(), pull(), pullCalendar(), initialLoad(), fullSync(), scheduleFlush()
    │   ├── offlineQueue.ts     enqueue(), getPending(), markDone(), markFailed(), etc.
    │   └── recurrenceService.ts getNextDueDate(), createNextOccurrence()
    ├── api/
    │   ├── sheetsClient.ts     sheetsRequest(), findRowIndex(), invalidateRowCache()
    │   ├── spreadsheetSetup.ts ensureSpreadsheet() — Drive search / create
    │   ├── seedOnboarding.ts   seedOnboarding() — writes initial data to new spreadsheet
    │   ├── tasksApi.ts         fetchAllTasks(), appendTask(), updateTask(), ensureHeader()
    │   ├── foldersApi.ts       fetchAllFolders(), appendFolder(), updateFolder(), ensureFolderHeader()
    │   ├── labelsApi.ts        fetchAllLabels(), appendLabel(), updateLabel(), ensureLabelHeader()
    │   ├── settingsApi.ts      loadSettings(), saveSettings() — settings!A1 JSON blob
    │   ├── calendarApi.ts      listCalendars(), listEvents(), getEvent(), createEvent(), updateEvent(), deleteEvent()
    │   └── driveApi.ts         listUserSheets()
    ├── store/
    │   ├── authStore.ts        user, accessToken, tokenExpiry, spreadsheetId; persist to localStorage
    │   ├── tasksStore.ts       tasks[], addTask, updateTask, completeTask, deleteTask, upsertMany
    │   ├── foldersStore.ts     folders[], addFolder, updateFolder, deleteFolder, ensureInbox
    │   ├── labelsStore.ts      labels[], addLabel, updateLabel, renameLabel, deleteLabel
    │   ├── calendarStore.ts    events[], calendars[], setEvents, upsertEvent, removeEvent
    │   ├── prefsStore.ts       sectionOpen, calendarEnabled, enabledCalendarIds; saves to settings sheet
    │   ├── syncStore.ts        isSyncing, isOnline, lastSyncAt, pendingCount, syncError
    │   └── uiStore.ts          selectedView, selectedFolderId, selectedLabelId, selectedPriority, selectedCalendarId
    ├── hooks/
    │   ├── useSync.ts          online/offline/visibilitychange/pagehide event handlers
    │   └── useTasks.ts         useUpcomingGroups, useUpcomingGroupsWithEvents, useAllTasks, useLabelTasks,
    │                           usePriorityTasks, useCalendarEvents, useCompletedTasks, useFilteredRootTasks
    └── components/
        ├── layout/
        │   ├── AppShell.tsx    Top-level shell: Header + Sidebar + main content
        │   ├── LoginPage.tsx   Google sign-in page
        │   ├── Header.tsx      App bar with title, hamburger, user avatar dropdown
        │   └── Sidebar.tsx     Navigation, folders, labels, calendars, sync status
        ├── tasks/
        │   ├── TaskList.tsx    View router + all view implementations
        │   ├── TaskItem.tsx    Single task row with inline actions
        │   ├── TaskChildren.tsx DnD sortable child list
        │   ├── TaskCreateModal.tsx Create/edit task or calendar event dialog
        │   └── TimePickerDialog.tsx Deadline + repeat picker dialog
        ├── calendar/
        │   ├── CalendarEventItem.tsx Event row (mirrors TaskItem layout)
        │   └── EventScheduleDialog.tsx Edit event schedule/recurrence dialog
        ├── settings/
        │   └── SettingsPage.tsx Spreadsheet picker + calendar toggle/list
        ├── help/
        │   └── HelpPage.tsx    Static user guide
        ├── feedback/
        │   └── FeedbackPage.tsx Feedback form (posts to Google Apps Script URL)
        ├── common/
        │   ├── ConfirmDialog.tsx Generic confirmation dialog
        │   ├── DeadlineBadge.tsx Overdue/today/normal deadline badge
        │   ├── PriorityBadge.tsx Russian-labelled priority badge
        │   ├── SyncStatusBanner.tsx Offline/syncing/error banner
        │   └── Toast.tsx        Auto-dismiss bottom toast
        └── labels/
            └── LabelBadge.tsx  Colored label pill
```

---

## 5. Data Model

### Task

| Field | Type | Description |
|---|---|---|
| id | string | Unique ID, format `tsk_<8hex>` |
| parent_id | string | ID of parent task, or `''` for root tasks |
| folder_id | string | ID of folder this task belongs to |
| title | string | Task title text |
| status | `'pending' \| 'completed' \| 'deleted'` | Task lifecycle state |
| priority | `'urgent' \| 'important' \| 'normal'` | Priority level |
| deadline_date | string | ISO date `YYYY-MM-DD` or `''` |
| deadline_time | string | `HH:MM` or `''` |
| is_recurring | boolean | Whether this task repeats |
| recur_type | `'days' \| 'weeks' \| 'months' \| 'years' \| ''` | Recurrence unit |
| recur_value | number | Recurrence interval |
| labels | string | Comma-separated label IDs, e.g. `'lbl-abc,lbl-def'` or `''` |
| sort_order | number | Integer position within folder/parent |
| created_at | string | ISO 8601 datetime |
| updated_at | string | ISO 8601 datetime, updated on every mutation |
| completed_at | string | ISO 8601 datetime or `''` |
| is_expanded | boolean | Whether subtask list is expanded in UI |

**Invariants:**
- Root tasks have `parent_id === ''`.
- Tasks with `status === 'deleted'` are excluded from all Zustand in-memory loads (`loadFromDb` filters to `pending | completed`).
- `sort_order` is only meaningful for tasks within the same `(folder_id, parent_id)` group.
- When `is_recurring === true`, completing the task advances `deadline_date` by `recur_value` `recur_type` instead of setting `status = 'completed'`.
- `TaskInput` omits `id`, `created_at`, `updated_at`, `completed_at`, `is_expanded`.

### Folder

| Field | Type | Description |
|---|---|---|
| id | string | Unique ID, format `fld_<8hex>` (special: `fld-inbox`) |
| name | string | Display name |
| color | string | Hex color e.g. `'#3B82F6'` or `''` |
| sort_order | number | Display order in sidebar |

**Invariants:**
- The Inbox folder always has `id === 'fld-inbox'`, `sort_order === -1`.
- `ensureInbox()` creates the Inbox folder if it does not exist after every `initialLoad`.
- Deleting a folder moves all its tasks to Inbox before deletion.
- `FolderInput` omits `id`.

### Label

| Field | Type | Description |
|---|---|---|
| id | string | Unique ID, format `lbl_<8hex>` |
| name | string | Display name |
| color | string | Hex color e.g. `'#EF4444'` |
| sort_order | number | Display order in sidebar |

**Invariants:**
- Deleting a label strips that label ID from all tasks (`stripLabelFromTasks`).
- `LabelInput` omits `id`.

### CalendarEvent

| Field | Type | Description |
|---|---|---|
| id | string | Google Calendar event ID |
| calendarId | string | Parent calendar ID |
| calendarName | string | Calendar display name (denormalised at fetch time) |
| calendarColor | string | Hex background color of the calendar |
| title | string | Event title; defaults to `'(No title)'` if none |
| startDate | string | `YYYY-MM-DD` |
| startTime | string | `HH:MM` or `''` (all-day) |
| endTime | string | `HH:MM` or `''` |
| isAllDay | boolean | True when the event has no time component |
| recurringEventId | `string \| null` | Non-null when this is an instance of a recurring series |

### CalendarItem

| Field | Type | Description |
|---|---|---|
| id | string | Google Calendar ID |
| summary | string | Calendar display name |
| color | string | Hex background color |
| isSelected | boolean | Whether selected in Google Calendar UI |
| accessRole | string | `'owner' \| 'writer' \| 'reader' \| 'freeBusyReader'` |

**Invariant:** Only calendars with `accessRole` of `'owner'` or `'writer'` show Edit/Delete actions in the UI.

---

## 6. Database / Storage Schema

### Google Sheets (remote storage)

The spreadsheet is named `db_tasks`. It has four sheets: `tasks`, `folders`, `labels`, `settings`.

#### tasks sheet — range `tasks!A:Q` (17 columns)

| Col | Index | Header | Type in sheet | Notes |
|---|---|---|---|---|
| A | 0 | id | string | e.g. `tsk_a1b2c3d4` |
| B | 1 | parent_id | string | `''` for root tasks |
| C | 2 | folder_id | string | |
| D | 3 | title | string | |
| E | 4 | status | string | `pending \| completed \| deleted` |
| F | 5 | priority | string | `urgent \| important \| normal` |
| G | 6 | deadline_date | string | `YYYY-MM-DD` or `''` |
| H | 7 | deadline_time | string | `HH:MM` or `''` |
| I | 8 | is_recurring | string | `TRUE` or `FALSE` |
| J | 9 | recur_type | string | `days \| weeks \| months \| years \| ''` |
| K | 10 | recur_value | string | numeric string, e.g. `'1'` |
| L | 11 | labels | string | comma-separated label IDs or `''` |
| M | 12 | sort_order | string | numeric string |
| N | 13 | created_at | string | ISO 8601 |
| O | 14 | updated_at | string | ISO 8601 |
| P | 15 | completed_at | string | ISO 8601 or `''` |
| Q | 16 | is_expanded | string | `TRUE` or `FALSE` |

Row 1 is the header. Data starts at row 2. Rows are appended via `values:append` and updated via `values/{range}?valueInputOption=RAW` (PUT). Deleted tasks are soft-deleted (status set to `'deleted'`). `ensureHeader()` handles migration: if row length < 16, adds `completed_at`/`is_expanded`; if length < 17, adds `is_expanded`.

#### folders sheet — range `folders!A:D` (4 columns)

| Col | Index | Header | Notes |
|---|---|---|---|
| A | 0 | id | |
| B | 1 | name | |
| C | 2 | color | hex string |
| D | 3 | sort_order | numeric string |

#### labels sheet — range `labels!A:D` (4 columns)

Same column layout as folders: `id | name | color | sort_order`.

#### settings sheet — cell `settings!A1`

Single cell containing a JSON string. Structure:

```json
{
  "sectionOpen": { "priorities": true, "folders": true, "labels": true },
  "calendarEnabled": false,
  "enabledCalendarIds": []
}
```

Written by `saveSettings()`, read by `loadSettings()`. Falls back to `{}` on error. If the sheet does not exist, `saveSettings` creates it via `batchUpdate`.

---

### Local Database — Dexie / IndexedDB

Database name: **`TaskManagerDB`**

#### Version 1

| Table | Dexie schema string | Notes |
|---|---|---|
| tasks | `&id, parent_id, folder_id, status, updated_at` | `&id` = unique primary key |
| folders | `&id, parent_id` | |
| labels | `&id` | |
| queue | `++localId, entityType, operationType, status, createdAt` | `++localId` = auto-increment PK |

#### Version 2 (additive migration)

| Table | Dexie schema string | Notes |
|---|---|---|
| calendarEvents | `&id, startDate, calendarId` | Added in v2 |

#### Index details

- `tasks.status` — used by `loadFromDb` (`where('status').anyOf(['pending','completed'])`)
- `tasks.updated_at` — available for future queries
- `queue.status` — used by `getPending` (`where('status').anyOf(['pending','failed'])`)
- `queue.createdAt` — used for `sortBy('createdAt')` in `getPending`
- `queue.entityId` — used by `removePendingForEntity`
- `calendarEvents.startDate` — available for date range queries
- `calendarEvents.calendarId` — available for calendar-scoped queries

#### Migration history

- **v1 → v2**: adds `calendarEvents` table. Dexie applies additive migrations automatically; no data transformation needed.

---

## 7. Authentication & First-Launch Setup

### Full auth flow (numbered steps)

1. `App.tsx` mounts; calls `initAuth()` from `authService.ts`.
2. `initAuth()` dynamically injects the GIS script (`https://accounts.google.com/gsi/client`) if not already present.
3. `google.accounts.oauth2.initTokenClient` is called with:
   - `client_id: VITE_GOOGLE_CLIENT_ID`
   - `scope: email profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/calendar`
   - `login_hint`: user's email from `authStore` (if known), for silent refresh
   - `callback`: stores the token via `resolveTokenRequest(token, expiresIn)`; fetches user profile from `https://www.googleapis.com/oauth2/v3/userinfo`
4. `authStore` is checked: if `accessToken` is present and not expired (> 60 s remaining), it is used as-is (restored from `localStorage`).
5. If token is expired but `user` is known: `refreshToken()` is called, which invokes `_tokenClient.requestAccessToken({ prompt: '' })` (silent refresh — no popup if previously authorized).
6. If neither condition is met: `isAuthenticated` remains `false`; `LoginPage` is rendered.
7. On `LoginPage`, the "Sign in with Google" button calls `refreshToken()` which opens the GIS consent popup.
8. After successful token receipt: `isAuthenticated` becomes `true`; `App.tsx` renders `AppShell`.

### First-launch setup (AppShell mount)

1. `ensureSpreadsheet()` is called:
   a. If `spreadsheetId` is already in `authStore` (localStorage): return `{ isNew: false }`.
   b. Otherwise: search Google Drive for `name='db_tasks' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`.
   c. If found: call `setSpreadsheet(id, name)` → return `{ isNew: false }`.
   d. If not found: create a new spreadsheet with title `db_tasks` and four sheets: `tasks`, `folders`, `labels`, `settings`. Return `{ isNew: true }`.
2. If `isNew === true`: call `seedOnboarding()`.
3. `initialLoad()`:
   a. `ensureHeader()` / `ensureFolderHeader()` / `ensureLabelHeader()` — ensures all sheet headers exist.
   b. `flush()` — pushes any queued offline changes.
   c. `pull()` — fetches and upserts tasks, folders, labels.
   d. `pullCalendar()` — if `calendarEnabled`, fetches events.
4. `ensureInbox()` — guarantees the Inbox folder exists in Dexie and Zustand.
5. `usePrefsStore.load()` — reads `settings!A1` and restores sidebar section states and calendar preferences.

### Token refresh in flight

`sheetsClient.ts` and `calendarApi.ts` both implement automatic token refresh: if a request returns HTTP 401, one refresh attempt is made. If the refresh succeeds, the original request is retried once. A second 401 throws an error.

### Onboarding seed data

`seedOnboarding()` is called once when a brand-new `db_tasks` spreadsheet is created. It writes all data via a single `values:batchUpdate` call with `valueInputOption: 'RAW'`.

**Folders written:**

| ID | Name | Color | sort_order |
|---|---|---|---|
| `fld-work` | Work | `#4A90D9` | 1 |
| `fld-personal` | Personal | `#7ED321` | 2 |

_(The Inbox folder `fld-inbox` is not seeded here; it is created by `ensureInbox()` after `initialLoad`.)_

**Labels written:**

| ID | Name | Color | sort_order |
|---|---|---|---|
| `lbl-review` | Review | `#F5A623` | 1 |
| `lbl-idea` | Idea | `#9B59B6` | 2 |

**Tasks written:**

| ID | Folder | Title | Priority | deadline_date | labels |
|---|---|---|---|---|---|
| `tsk-seed-1` | `fld-work` | Make important call | important | (none) | (none) |
| `tsk-seed-2` | `fld-work` | Review project draft | normal | (none) | `lbl-review` |
| `tsk-seed-3` | `fld-personal` | Buy groceries | urgent | (none) | (none) |
| `tsk-seed-4` | `fld-personal` | Schedule dentist appointment | normal | today+5 days | (none) |
| `tsk-seed-5` | `fld-inbox` | Plan the week | normal | (none) | `lbl-idea` |

All seeded tasks have `status: 'pending'`, `parent_id: ''`, `is_recurring: 'FALSE'`, `is_expanded: 'TRUE'`.

---

## 8. Synchronization / API Layer

### Push path (flush) — step-by-step

1. `flush()` calls `getPending()`: returns all `QueueItem` rows where `status IN ('pending','failed') AND retryCount < 5`, sorted by `createdAt` ascending.
2. Deduplication: iterate items and build a `Map<key, item>` where `key = "${entityType}:${entityId}:${operationType}"`. For each key, keep the item with the latest `createdAt`. All superseded items are `markDone` (deleted from queue) without being sent to Sheets.
3. For each surviving item:
   a. `markProcessing(localId)` — sets `status = 'processing'`.
   b. `processQueueItem(item)`:
      - `task/create` → `appendTask`
      - `task/update` → `updateTask` (finds row by ID, falls back to append if not found)
      - `task/delete` → `updateTask` with `status: 'deleted'`
      - `folder/create` → `appendFolder`
      - `folder/update` → `updateFolder`
      - `label/create` → `appendLabel`
      - `label/update` → `updateLabel`
   c. On success: `markDone(localId)` (deletes the queue row).
   d. On error: `markFailed(localId, retryCount + 1)`.
4. `invalidateRowCache()` — clears the `entityId → sheet row` cache.
5. Update `syncStore.pendingCount`.

**Debounced flush:** `scheduleFlush()` sets a 800 ms debounce timer. Rapid mutations (e.g., drag-and-drop reorder) are batched.

### Pull path

`pull()` fetches all tasks, folders, labels in parallel (`Promise.all`). For each entity list, `upsertMany()` is called:
- **Tasks:** for each incoming task, compare `updated_at` with local Dexie record; keep the newer. `bulkPut` all resolved records. Reload all `pending | completed` tasks from Dexie into Zustand.
- **Folders / Labels:** `bulkPut` all incoming records (no per-field conflict check, since sheets is the authority after a pull).

### Calendar sync

`pullCalendar()`:
1. Guard: returns immediately if `calendarEnabled === false`.
2. Fetch the calendar list from `GET /users/me/calendarList`.
3. For each `enabledCalendarId`, call `listEvents(id, name, color, timeMin, timeMax)` where `timeMin = startOfDay(today).toISOString()` and `timeMax = addDays(today, 366).toISOString()`.
4. `listEvents` handles pagination via `nextPageToken`. Cancelled events (`status === 'cancelled'`) are filtered out.
5. All collected events are passed to `calendarStore.setEvents()`: clears Dexie `calendarEvents`, bulk-inserts new events, updates in-memory state.
6. On error: `calStore.loadFromDb()` (serves stale data from Dexie).

### fullSync

`fullSync()` checks `isSyncing`; if already syncing, returns. Sets `isSyncing = true`, then: `flush()` → `pull()` → `pullCalendar()`. On error: sets `syncError`. Always sets `isSyncing = false` and updates `pendingCount`.

### Offline behavior

- `useSync` hook listens for `window.offline` → sets `isOnline = false`.
- All writes still succeed (write to Dexie + queue).
- `SyncStatusBanner` shows offline + pending count when `isOnline === false`.
- When `window.online` fires → `fullSync()` runs automatically.
- `pagehide` event → `flush()` ensures writes are sent when the user closes or backgrounds the app.
- `visibilitychange` to visible → `fullSync()` if last sync > 5 minutes ago.

---

## 9. UI Screens

### AppShell layout

`AppShell` renders:
- `Header` (full width, height h-14)
- Desktop sidebar: `<aside class="hidden md:flex w-60">` with `Sidebar`
- Mobile sidebar: Radix `Sheet` drawer, `side="left"`, width 60
- Main content: `TaskList`, or `SettingsPage`, or `HelpPage`, or `FeedbackPage`

When `settingsOpen`, `helpOpen`, or `feedbackOpen` is true in `uiStore`, the sidebar is hidden and the page replaces `TaskList`.

---

### UpcomingView

- **Data:** `useUpcomingGroupsWithEvents()` — all pending tasks with `deadline_date`, plus all calendar events; merged and grouped by day.
- **Filters:** `priorityFilter`, `labelFilter`, `folderFilter`, `calendarFilter` (all multi-select, applied via `filterMatrix`).
- **Sort (per group):** items with a time sort earlier than all-day/timeless items; all-day and timeless items use `'99:99'` sentinel.
- **Layout:** `WeekStrip` (7-day navigation strip at top) + `FilterBar` + scrollable groups. Each day group has a header label. Overdue group is first, coloured red.
- **Empty state:** `FolderOpen size=40 opacity-20` + "No upcoming tasks" + "Add task" ghost button.
- **Special features:** `IntersectionObserver` tracks the topmost visible date group and highlights it in the `WeekStrip`. Clicking a day in the strip scrolls to that date's group. Week navigation arrows move the strip; the "Today" button scrolls to today.
- **User actions:** check task (complete/advance), open `TimePickerDialog`, open `TaskCreateModal` (edit), delete, label/priority pickers inline. For events: edit (opens `TaskCreateModal` in event mode), delete (with recurring choice dialog), edit schedule (opens `EventScheduleDialog`).

### AllTasksView

- **Data:** `useAllTasks()` (all pending tasks) + calendar events (today to today+366 when `calendarEnabled`).
- **Filters:** same `FilterBar` with `filterMatrix`.
- **Sort:** merged list sorted by priority (urgent=0, important=1, normal=2), then date+time, then tasks with no deadline last. Events are ranked as priority 2 (normal).
- **Layout:** flat list; no grouping. Shows `showDate={true}` on `CalendarEventItem`.
- **Empty state:** `FolderOpen size=40 opacity-20` + "No tasks" + "Add task" ghost button.

### FolderView

- **Data:** `useFilteredRootTasks()` — pending root tasks (`parent_id === ''`) filtered to `selectedFolderId`. Inbox view includes tasks with `folder_id === ''` too.
- **Sort:** `sort_order` ascending.
- **Layout:** `DndContext` + `SortableContext` — tasks are drag-and-drop reorderable via `@dnd-kit`. Dragging right (delta.x > 50 px) re-parents the dragged task under the task it overlaps.
- **Empty state:** `FolderOpen size=40 opacity-20` + "No tasks" + "Add task" button.
- **User actions:** all TaskItem actions; reorder by drag; re-parent by drag-right.

### LabelView

- **Data:** `useLabelTasks()` — pending tasks whose `labels` field includes `selectedLabelId`, sorted by priority → deadline → created_at.
- **Filters:** `FilterBar` (priority, label, folder; calendar filter shown but events not included).
- **Layout:** flat list; `hideLabels` is true on `TaskItem`.
- **Empty state:** `FolderOpen size=40 opacity-20` + "No tasks" + "Add task" button.

### PriorityView

- **Data:** `usePriorityTasks()` — pending tasks with `priority === selectedPriority`, sorted by deadline → created_at.
- **No filter bar.**
- **Layout:** flat list; `hideChildren` is true.
- **Empty state:** `FolderOpen size=40 opacity-20` + "No tasks" + "Add task" button.

### CompletedView

- **Data:** `useCompletedTasks()` — all tasks with `status === 'completed'`, sorted by `completed_at` or `updated_at` descending.
- **Filters:** `FilterBar` (priority, label, folder).
- **Layout:** custom row: strikethrough title, completion datetime, label names, folder name. `RotateCcw` button (restore to pending) and `Trash2` button (hard delete).
- **Empty state:** `FolderOpen size=40 opacity-20` + "No completed tasks".
- **User actions:** restore task to pending (clears `completed_at`, sets `status: 'pending'`); permanently delete task.

### CalendarEventListView

- **Data:** `useCalendarEvents(selectedCalendarId)` — events for the selected calendar, sorted by `startDate` → `startTime`.
- **Guard:** if `calendarEnabled === false`, shows a prompt to enable in Settings.
- **Layout:** grouped by day; each group has a day header. Uses `CalendarEventItem` with `showDate={false}`.
- **Empty state:** `CalendarDays size=40 opacity-20` + "No events".
- **User actions:** edit event (opens `TaskCreateModal`), edit schedule (opens `EventScheduleDialog`), delete (with recurring choice dialog if applicable).

### LoginPage

- Shows app logo (`ListTodo` icon + title "Tasks"), tagline, and "Sign in with Google" button.
- Button triggers `refreshToken()` from `authStore`. Shows loading state while signing in.

### SettingsPage

- **Spreadsheet section:** shows current spreadsheet name/ID. "Change" button opens an inline list of all Google Sheets from the user's Drive (`listUserSheets()`). Selecting a different sheet clears Dexie (tasks, folders, labels, queue), invalidates row cache, then runs `initialLoad()`.
- **Calendars section:** toggle switch for `calendarEnabled`. When enabled, fetches `listCalendars()` and shows each calendar with a checkbox. Toggling a calendar calls `setEnabledCalendarIds()` + `pullCalendar()`. Refresh button re-fetches calendar list. If the Calendar API returns 403, shows a "Grant access" button that triggers `refreshToken()`.

### HelpPage

Static content page with sections: Getting started, Tasks, Views, Calendar & events, Sync & offline, Install as app. Rendered using internal `Card`, `Para`, `List`, `Note`, `FeatureTable`, and `SectionLabel` components defined inline in `HelpPage.tsx`. Header title: "Short guide".

### FeedbackPage

- Requires `VITE_FEEDBACK_URL` env variable (Google Apps Script URL). If not set, shows "Feedback is not configured yet."
- Text area for message. Send button POSTs `app=Tasks&email=<userEmail>&message=<text>` to the Apps Script URL with `mode: 'no-cors'`.
- Success/error shown via `Toast` component.

---

## 10. Key Components

### TaskItem

| Prop | Type | Default | Description |
|---|---|---|---|
| task | Task | required | Task data |
| depth | number | required | Nesting depth (0 = root) |
| showFolder | boolean | false | Show folder chip in second line |
| hideChildren | boolean | false | Suppress subtask rendering |
| hideDeadline | boolean | false | Only show time, not date |
| hideLabels | boolean | false | Suppress label chips |

**Internal state:** `expanded`, `confirmDelete`, `editOpen`, `addChildOpen`, `labelPickerOpen`, `priorityPickerOpen`, `timePickerOpen`.

**Layout:** Two-row structure. Row 1: expand chevron | Radix Checkbox | title | action icons. Row 2 (if any of: deadline, labels, folder, recurring, child count): recurring icon, deadline label, label chips, folder chip, child counts (completed/pending/total).

**Desktop actions (md+):** Clock (deadline), Flag (priority picker), Tag (label picker), Plus (add subtask), Pencil (edit), Trash.  
**Mobile actions:** Clock + `MoreHorizontal` dropdown with submenus for Priority, Labels, Add subtask, Edit, Delete.

**Deadline colors:** overdue → `text-red-400`, today → `text-green-600`, tomorrow → `text-orange-400`, week (2–7 days) → `text-violet-400`, future → `text-muted-foreground`.

**Complete handler for recurring tasks:** calls `updateTask(id, { deadline_date: nextDate })` + immediate `flush()`. Does NOT call `completeTask`.

### TaskChildren

**Props:** `tasks: Task[]`, `depth: number`, `showFolder?: boolean`.

Renders a `DndContext` + `SortableContext` (vertical list). Drag-and-drop reorders `sort_order` (× 10 spacing). Drag-right (delta.x > 50) re-parents.

### TaskCreateModal

**Props:** `open: boolean`, `editing?: Task | null`, `editingEvent?: CalendarEvent | null`, `parentId?: string`, `onClose: () => void`.

Two modes: **task mode** and **event mode**. A toggle tab appears when creating a new item and `calendarEnabled && enabledCalendars.length > 0`.

**Task mode fields:** title (with smart-title parsing on submit), due date, time, repeat (every N days/weeks/months/years), folder picker (separate Dialog), labels picker (bottom Sheet with inline label creation), priority chips. Clear button clears deadline + recurrence. Postpone button (visible when editing recurring task) advances deadline by one interval.

**Event mode fields:** title, date chip, start time chip, end time chip, repeat checkbox + interval + type, recurrence extras (weekly day buttons, monthly pattern select, ends: Never/On date/After N), calendar select.

On submit (event): if editing a recurring instance and no `recurringChoice` given, shows `EditRecurringDialog` offering "Edit this event only" or "Edit all events in series".

### TimePickerDialog

**Props:** `open: boolean`, `task: Task`, `onClose: () => void`.

Focused deadline/recurrence editor. Fields: date, time (hidden when no date), repeat checkbox + interval + type (hidden when no date). Clear button clears date/time/recurrence. Postpone button advances deadline by one recurrence interval.

### CalendarEventItem

| Prop | Type | Default | Description |
|---|---|---|---|
| event | CalendarEvent | required | |
| showDate | boolean | required | Prepend date label in time slot |
| isEditable | boolean | true | Show/hide action buttons |
| onEdit | () => void | required | |
| onDelete | () => void | required | |
| onDeleteSeries | () => void | required | |

Two-row layout mirroring `TaskItem`. Row 1: spacer | `CalendarDays` icon | title | Clock button + `...` dropdown (Edit, Delete). Row 2: time label | `CalendarDays` icon | calendar name.

Delete: if recurring, shows `RecurringDeleteDialog`; otherwise `ConfirmDialog`. Clock button opens `EventScheduleDialog`. Read-only calendars (`isEditable === false`): no action buttons, replaced with a `w-[54px]` spacer so titles align with editable events.

### EventScheduleDialog

**Props:** `event: CalendarEvent`, `open: boolean`, `onClose: () => void`.

Date chip, start/end time chips, repeat section (weekly day buttons, monthly pattern select, ends options). Loads existing RRULE from the recurring base event on open. For recurring instances, shows `RecurringChoiceDialog` on save.

### ConfirmDialog

**Props:** `open`, `title`, `description?`, `confirmLabel?` (default `'Delete'`), `onConfirm`, `onCancel`. Standard dialog with Cancel (outline) + Confirm (destructive) buttons.

### SyncStatusBanner

Reads `isOnline`, `isSyncing`, `pendingCount`, `syncError` from `syncStore`. Renders nothing when online and idle. Three variants: Offline (amber, shows pending count), Syncing (blue, spinning icon), Error (red, "Retry" link).

### Toast

**Props:** `message: string`, `onDone: () => void`, `duration?: number` (default 2800 ms). Fixed bottom-center toast that auto-dismisses. Uses `animate-in fade-in slide-in-from-bottom-2`.

### DeadlineBadge

**Props:** `deadlineDate: string`, `deadlineTime: string`. Returns null if no date. Shows formatted date label; red if overdue, blue if today.

### PriorityBadge

**Props:** `priority: Priority`. Returns null for `normal`. Shows Russian labels: Срочно (urgent, red), Важно (important, amber).

### LabelBadge

**Props:** `labelId: string`. Looks up label by ID from `labelsStore`. Returns null if not found. Colored rounded-full pill.

---

## 11. Theme & Colors

### CSS custom properties (index.css)

#### Light mode (`:root`)

| Property | Value (HSL) | Approximate hex |
|---|---|---|
| `--background` | `0 0% 100%` | #ffffff |
| `--foreground` | `240 10% 10%` | #181829 |
| `--card` | `0 0% 100%` | #ffffff |
| `--card-foreground` | `240 10% 10%` | #181829 |
| `--popover` | `0 0% 100%` | #ffffff |
| `--popover-foreground` | `240 10% 10%` | #181829 |
| `--primary` | `25 75% 55%` | ~#e07e38 |
| `--primary-foreground` | `0 0% 100%` | #ffffff |
| `--secondary` | `25 8% 95%` | ~#f2f0ef |
| `--secondary-foreground` | `240 10% 10%` | #181829 |
| `--muted` | `25 8% 95%` | ~#f2f0ef |
| `--muted-foreground` | `0 0% 42%` | ~#6b6b6b |
| `--accent` | `38 60% 96%` | ~#fdf4ec |
| `--accent-foreground` | `25 60% 35%` | ~#8c4c1a |
| `--destructive` | `0 70% 67%` | ~#e05757 |
| `--destructive-foreground` | `0 0% 100%` | #ffffff |
| `--border` | `0 0% 88%` | ~#e0e0e0 |
| `--input` | `0 0% 88%` | ~#e0e0e0 |
| `--ring` | `25 75% 55%` | ~#e07e38 |
| `--radius` | `0.5rem` | border-radius base |

#### Dark mode (`@media (prefers-color-scheme: dark)`)

| Property | Value (HSL) |
|---|---|
| `--background` | `0 0% 11%` |
| `--foreground` | `0 0% 95%` |
| `--card` | `0 0% 21%` |
| `--card-foreground` | `0 0% 95%` |
| `--popover` | `0 0% 14%` |
| `--popover-foreground` | `0 0% 95%` |
| `--primary` | `25 65% 63%` |
| `--primary-foreground` | `0 0% 100%` |
| `--secondary` | `0 0% 21%` |
| `--secondary-foreground` | `0 0% 95%` |
| `--muted` | `0 0% 21%` |
| `--muted-foreground` | `0 0% 58%` |
| `--accent` | `0 0% 18%` |
| `--accent-foreground` | `0 0% 95%` |
| `--destructive` | `0 55% 58%` |
| `--destructive-foreground` | `0 0% 100%` |
| `--border` | `0 0% 29%` |
| `--input` | `0 0% 22%` |
| `--ring` | `25 65% 63%` |

### Tailwind config tokens

- `darkMode: 'media'` — responds to OS preference
- `fontSize.xs` and `fontSize.sm` both overridden to `['1rem', { lineHeight: '1.5rem' }]`
- `borderRadius.lg` → `var(--radius)`, `.md` → `calc(var(--radius) - 2px)`, `.sm` → `calc(var(--radius) - 4px)`
- All color tokens mapped to `hsl(var(--TOKEN))`
- Plugin: `tailwindcss-animate`

### Priority colors (hardcoded in components)

| Priority | Hex | Used for |
|---|---|---|
| urgent | `#f87171` | Flag icon, checkbox border/fill, Sidebar |
| important | `#fb923c` | Flag icon, checkbox border/fill, Sidebar |
| normal | `#9ca3af` | Flag icon, Sidebar |

### PWA theme color

`#e07e38` — set in both `vite.config.ts` manifest and `<meta name="theme-color">` in `index.html`.

### Label color presets (constants.ts)

`'#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#6b7280'`

---

## 12. Navigation & Deeplinks

The app has **no URL-based router**. All navigation is managed by `uiStore` (Zustand, in-memory only — not persisted). There are no route strings, no `react-router`, and no `history` API usage.

### SelectedView type (`src/store/uiStore.ts`)

```ts
type SelectedView = 'upcoming' | 'all' | 'folder' | 'label' | 'priority' | 'completed' | 'calendar'
```

### View activation

| Method | Effect |
|--------|--------|
| `setView('upcoming')` | Shows UpcomingView; clears folder/label/priority/calendar IDs |
| `setView('all')` | Shows AllTasksView |
| `setView('folder', folderId)` | Shows FolderView for the given folder |
| `setView('label', labelId)` | Shows LabelView for the given label |
| `setView('priority', 'urgent'\|'important'\|'normal')` | Shows PriorityView |
| `setView('completed')` | Shows CompletedView |
| `setCalendarView(calendarId)` | Shows CalendarEventListView for the given calendar |

### Overlay screens

Overlay screens are boolean flags in `uiStore`, rendered over the main content. When any is open, the sidebar and `TaskList` are hidden; the header shows a `ChevronLeft` back button.

| Flag | Screen rendered | Header title |
|------|----------------|--------------|
| `settingsOpen` | `<SettingsPage />` | "Settings" |
| `helpOpen` | `<HelpPage />` | "Short guide" |
| `feedbackOpen` | `<FeedbackPage />` | "Feedback" |

### Default view

`selectedView` initialises to `'upcoming'`. There is no persisted last-view state.

### Deeplinks

There are no deeplink URI schemes or URL parameters. The app is always served from `/`.

---

## 13. Loading & Empty States

### Global sync banner (`SyncStatusBanner.tsx`)

Rendered above the main content area. Hidden when `isOnline && !isSyncing && pendingCount === 0 && !syncError`.

| Condition | Background | Icon | Text |
|-----------|-----------|------|------|
| `!isOnline` | `bg-amber-50 border-amber-200 text-amber-700` | `WifiOff size=14` | "Offline" or "Offline · N changes pending" |
| `syncError` | `bg-red-50 border-red-200 text-red-700` | `AlertCircle size=14` | "Sync error" + "Retry" link → `fullSync()` |
| `isSyncing` | `bg-blue-50 border-blue-200 text-blue-700` | `RefreshCw size=14 animate-spin` | "Syncing..." |

### Per-view empty states

No skeleton/shimmer animations exist. Loading progress is shown only via `SyncStatusBanner`. All empty containers use `flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3`.

| View | Icon | Message | Action button |
|------|------|---------|---------------|
| UpcomingView | `FolderOpen size=40 opacity-20` | "No upcoming tasks" | "+ Add task" → `setCreateTaskOpen(true)` |
| FolderView | `FolderOpen size=40 opacity-20` | "No tasks" | "+ Add task" |
| AllTasksView | `FolderOpen size=40 opacity-20` | "No tasks" | "+ Add task" |
| LabelView | `FolderOpen size=40 opacity-20` | "No tasks" | "+ Add task" |
| PriorityView | `FolderOpen size=40 opacity-20` | "No tasks" | "+ Add task" |
| CompletedView | `FolderOpen size=40 opacity-20` | "No completed tasks" | — |
| CalendarEventListView (disabled) | `CalendarDays size=40 opacity-20` | "Enable Google Calendar in Settings to see events here." | — |
| CalendarEventListView (no events) | `CalendarDays size=40 opacity-20` | "No events" | — |

---

## 14. CI/CD & Build

No CI/CD configuration is present in the repository. There are no GitHub Actions workflows, Dockerfiles, or deployment scripts in the codebase. Build is run manually with `npm run build` (`tsc -b && vite build`). Preview with `npm run preview`.

---

## 15. First-Time Setup (New Developer)

### Prerequisites

- Node.js ≥ 18, npm ≥ 9
- A Google account
- Access to [Google Cloud Console](https://console.cloud.google.com)

### Steps

**1. Clone and install**
```bash
git clone <repo-url>
cd Tasks-PWA
npm install
```

**2. Create the env file**
```bash
cp .env.example .env
```

**3. Google Cloud Console — create OAuth credentials**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a new project (or reuse one).
2. APIs & Services → Enable APIs:
   - Google Sheets API
   - Google Drive API
   - Google Calendar API
3. APIs & Services → Credentials → **Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:5173`
4. Copy the **Client ID** into `.env`:
   ```
   VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
   ```

**4. (Optional) Feedback endpoint**

Deploy a Google Apps Script that appends `[timestamp, app, email, message]` to a sheet. Deploy as Web app (Execute as: Me, Access: Anyone). Copy the URL into `.env`:
```
VITE_FEEDBACK_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```
If omitted, the Feedback page submits silently without error.

**5. Run locally**
```bash
npm run dev
# → http://localhost:5173
```

**6. First sign-in** — Click "Sign in with Google". On first run `ensureSpreadsheet()` searches Drive for `db_tasks`. If not found, a new Sheets file is created and seeded with sample data via `seedOnboarding()`. The spreadsheet ID is cached in `localStorage` (`auth-storage`).

### Available scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `vite` | Dev server at :5173 with HMR |
| `build` | `tsc -b && vite build` | Type-check + production bundle → `dist/` |
| `preview` | `vite preview` | Serve production build locally |
| `lint` | `eslint .` | Run ESLint |

---

## 16. Key Algorithms

### Recurring task advancement (recurrenceService)

```
function getNextDueDate(task):
  if not task.is_recurring or not task.deadline_date: return null
  base = parseISO(task.deadline_date)
  switch task.recur_type:
    'days'   → next = addDays(base, task.recur_value)
    'weeks'  → next = addWeeks(base, task.recur_value)
    'months' → next = addMonths(base, task.recur_value)
    'years'  → next = addYears(base, task.recur_value)
    default  → return null
  return format(next, 'yyyy-MM-dd')

// Called in TaskItem.handleComplete when task.is_recurring && task.deadline_date:
nextDate = getNextDueDate(task)
if nextDate:
  updateTask(task.id, { deadline_date: nextDate })
  flush()          // immediate, not debounced
// Task stays pending with the advanced deadline date.
```

### RRULE building (rrule.ts — buildRRule)

```
function buildRRule(opts):
  parts = ["FREQ=" + opts.freq]
  if opts.interval > 1:
    parts.push("INTERVAL=" + opts.interval)
  if opts.freq == 'WEEKLY' and opts.byDay.length > 0:
    parts.push("BYDAY=" + opts.byDay.join(','))
  if opts.freq == 'MONTHLY' and opts.monthlyByDay and opts.monthlyByDay != 'BY_MONTH_DAY':
    parts.push("BYDAY=" + opts.monthlyByDay)
  if opts.ends == 'ON_DATE' and opts.endDate:
    until = opts.endDate.replace(/-/g,'') + 'T000000Z'
    parts.push("UNTIL=" + until)
  else if opts.ends == 'AFTER_COUNT' and opts.afterCount:
    parts.push("COUNT=" + opts.afterCount)
  return "RRULE:" + parts.join(';')

// Example output: "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE"
```

### Offline queue deduplication (syncService.flush)

```
function flush():
  items = getPending()  // status IN ('pending','failed'), retryCount < 5, sorted by createdAt
  if items.length == 0: return

  latestMap = Map<string, QueueItem>()
  for item in items:
    key = item.entityType + ':' + item.entityId + ':' + item.operationType
    existing = latestMap.get(key)
    if not existing or item.createdAt > existing.createdAt:
      latestMap.set(key, item)

  latestIds = Set(latestMap.values().map(i => i.localId))

  for item in items:
    if item.localId not in latestIds:
      markDone(item.localId)   // discard superseded

  for item in latestMap.values():
    markProcessing(item.localId)
    try:
      processQueueItem(item)   // Sheets API call
      markDone(item.localId)
    catch err:
      markFailed(item.localId, item.retryCount + 1)

  invalidateRowCache()
  pendingCount = getQueueLength()
  syncStore.setPendingCount(pendingCount)
```

### Mixed task+event sort (AllTasksView)

```
// task entry: { sortDate = deadline_date || '9999-12-31',
//               sortTime = deadline_time || '99:99',
//               sortPriority = {urgent:0, important:1, normal:2}[priority] }
// event entry: { sortDate = startDate,
//                sortTime = isAllDay ? '99:99' : startTime,
//                sortPriority = 2 }

sort(entries):
  aNoDate = isTask and no deadline_date
  bNoDate = ...
  if aNoDate and bNoDate: return a.sortPriority - b.sortPriority
  if aNoDate: return +1    // tasks without dates always last
  if bNoDate: return -1
  if a.sortPriority != b.sortPriority: return a.sortPriority - b.sortPriority
  dc = a.sortDate.localeCompare(b.sortDate)
  if dc != 0: return dc
  return a.sortTime.localeCompare(b.sortTime)
```

### Smart title parsing (smartTitle.ts — parseSmartTitle)

```
function parseSmartTitle(raw, folders, labels, currentFolderId, currentLabelIds, currentPriority):
  title = raw

  // @FolderName → case-insensitive match; first match wins; unmatched stays in title
  title = title.replace(/@(\S+)/g, (match, name) =>
    folder = folders.find(f => f.name.toLowerCase() == name.toLowerCase())
    if folder: folderId = folder.id; return ''
    return match
  )

  // #LabelName → case-insensitive match; adds to labelIds; unmatched stays in title
  title = title.replace(/#(\S+)/g, (match, name) =>
    label = labels.find(l => l.name.toLowerCase() == name.toLowerCase())
    if label: labelIds.add(label.id); return ''
    return match
  )

  // !1 → urgent, !2 → important, !3 → normal
  title = title.replace(/!([123])/g, (match, digit) =>
    switch digit:
      '1': priority = 'urgent'
      '2': priority = 'important'
      '3': priority = 'normal'
    return ''
  )

  return {
    title: title.replace(/\s{2,}/g, ' ').trim(),
    folderId,
    labelsStr: Array.from(labelIds).join(','),
    priority,
  }
```
