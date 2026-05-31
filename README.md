# Stler Tasks — PWA

[![Live PWA](https://img.shields.io/badge/Stler_Tasks-Live_PWA-E07E38?style=for-the-badge)](https://stler-tasks.vercel.app)
[![Android App](https://img.shields.io/badge/Stler_Tasks-Android_App-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://github.com/JuliaSivridi/Tasks_Android)
![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google_Sheets_API-34A853?style=for-the-badge&logo=googlesheets&logoColor=white)
![Google OAuth](https://img.shields.io/badge/OAuth_2.0-4285F4?style=for-the-badge&logo=google&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

A personal task manager built as a **Progressive Web App** — the companion app to [Stler Tasks Android](https://github.com/JuliaSivridi/Tasks_Android). Both apps share the same `db_tasks` Google Spreadsheet, so tasks, folders, and labels stay in sync between browser and phone automatically.

**Live:** [stler-tasks.vercel.app](https://stler-tasks.vercel.app)

---

## Features

**Task management**
- Create tasks with title, priority, deadline (date + optional time), labels, and folder
- Subtasks at any depth with expand/collapse; progress counter on the parent row
- Recurring tasks — daily / weekly / monthly; completing a recurring task advances the deadline automatically, not marks it done
- Smart input: type `@FolderName`, `#LabelName`, or `!1`/`!2`/`!3` in the title to set folder / label / priority instantly
- Drag-and-drop reordering within a folder view

**Organization**
- **Folders** — group tasks; drag to reorder within a folder
- **Labels** — colored tags, multiple per task; filterable across all views
- **Priority** — Urgent / Important / Normal; color-coded flags on every task row

**App flexibility**
- Each feature area (Folders, Labels, Priorities, Calendars) can be individually toggled on/off in Settings
- All task data is preserved regardless of toggle state — turning a feature back on restores full visibility instantly
- Folders and Labels are managed directly in Settings (create, rename, delete)

**Views**
- **Upcoming** — tasks + calendar events grouped by day with a scrollable week strip; overdue section at the top
- **All Tasks** — flat list of all pending tasks and calendar events, interleaved by date; filter by priority / label / folder / calendar
- **Folder** — dedicated task list per folder with drag-to-reorder
- **Calendar** — event list for each connected calendar
- **Completed** — archive of done tasks

**Deadlines**
- Color-coded by urgency: overdue · today · tomorrow · this week · future
- Postpone button when editing a recurring task (advances by the recurrence interval)

**Google Calendar integration**
- Connect one or more Google Calendars in Settings
- Calendar events displayed inline with tasks in Upcoming and All Tasks, unified by date
- Create, edit, and delete events (including recurring) directly from the app
- Read-only calendars (e.g. public holidays) show events without edit controls

**Sync & offline**
- Full read/write offline via IndexedDB; sync queue flushes when back online
- Every mutation writes to IndexedDB immediately, then syncs to Google Sheets in the background
- On first sign-in the app automatically creates the `db_tasks` spreadsheet — no manual setup
- On logout, pending changes are flushed to Sheets and local data is cleared so the next account starts clean

**PWA**
- Installable on Android and iOS, works as a standalone app with its own icon
- Android: Chrome prompts automatically, or use the browser menu → *Install app*
- iOS: Safari → Share → *Add to Home Screen*

---

## Tech Stack

| Layer | Technology |
|---|---|
| ⚛️ Framework | React 19 + TypeScript 5 |
| ⚡ Build | Vite 7 |
| 🎨 Styling | Tailwind CSS v3 + shadcn/ui |
| 🗂️ State | Zustand 5 |
| ☁️ Remote storage | Google Sheets API v4 |
| 🔐 Auth | Google Identity Services (OAuth 2.0) |
| 💾 Offline storage | Dexie.js (IndexedDB) |
| ↕️ Drag & drop | @dnd-kit |
| 📅 Dates | date-fns |
| 📱 PWA | vite-plugin-pwa (Workbox) |
| 🌐 Hosting | Vercel |

---

## Architecture

```
src/
  api/          — Google Sheets & Drive API calls, spreadsheet setup, onboarding seed
  components/
    layout/     — AppShell, Header, Sidebar, LoginPage
    tasks/      — TaskList, TaskItem, TaskCreateModal, TaskChildren
    calendar/   — CalendarEventItem, EventScheduleDialog
    settings/   — SettingsPage
    common/     — ConfirmDialog, SyncStatusBanner, Toast
  hooks/        — useSync, useTasks
  services/     — db (Dexie), syncService, offlineQueue, recurrenceService
  store/        — authStore, tasksStore, foldersStore, labelsStore,
                  calendarStore, prefsStore, syncStore, uiStore
  types/        — Task, Folder, Label, CalendarEvent, …
  utils/        — smartTitle, dateUtils, sheetsMapper, rrule, …
```

**Data flow:** every mutation writes to Dexie immediately (triggers UI update) and adds an entry to the offline queue. A debounced flush sends the queue to Google Sheets; on next open the app pulls fresh data from Sheets into Dexie.

---

## Data Model

All data lives in the user's `db_tasks` Google Spreadsheet (found or created automatically on first login).

| Sheet | Columns (A → last) |
|---|---|
| `tasks` | id · parent_id · folder_id · title · status · priority · deadline_date · deadline_time · is_recurring · recur_type · recur_value · labels · sort_order · created_at · updated_at · completed_at · is_expanded |
| `folders` | id · name · color · sort_order |
| `labels` | id · name · color · sort_order |
| `settings` | A1 — JSON blob with user preferences (feature flags, calendar config, sidebar state) |

Row 1 of every sheet is a header row. Deleted rows are cleared (all cells emptied) rather than physically removed.

---

## Setup

### Prerequisites

- Google account
- Google Cloud project with **Google Sheets API v4**, **Google Drive API v3**, and **Google Calendar API** enabled
- OAuth 2.0 Client ID (type: Web application)
- Node.js ≥ 18

### Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and enable **Google Sheets API**, **Google Drive API**, and **Google Calendar API**
2. Create an **OAuth 2.0 Client ID** → type: Web application
3. Add to **Authorized JavaScript origins** (not Redirect URIs):
   ```
   http://localhost:5173
   https://your-app.vercel.app
   ```
4. Add your Google account as a **test user** in the OAuth consent screen

### Local Development

```bash
git clone https://github.com/JuliaSivridi/Tasks.git
cd Tasks
npm install
```

Create `.env` in the project root:
```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

```bash
npm run dev    # http://localhost:5173
npm run build  # production build
```

### Deploy to Vercel

1. Import the repository at [vercel.com](https://vercel.com)
2. Add `VITE_GOOGLE_CLIENT_ID` in project Settings → Environment Variables
3. Every push to `main` triggers automatic deployment

---

## Related

- **Android version:** [github.com/JuliaSivridi/Tasks_Android](https://github.com/JuliaSivridi/Tasks_Android) — Kotlin + Jetpack Compose, same Google Sheets backend
- **Technical specification:** [`docs/tech-spec.md`](docs/tech-spec.md)
