# Stler Tasks

A personal task manager built as a **Progressive Web App**. Runs in any browser and installs on Android/iOS home screens as a standalone app. No backend — Google Sheets is the database.

**Live:** [stler-tasks.vercel.app](https://stler-tasks.vercel.app)

> Inspired by [Todoist](https://todoist.com/) — one of the finest personal task managers out there. Stler Tasks delivers a similar UX as a serverless PWA backed solely by Google Sheets, with no subscription fee.

---

## Features

- **Multiple views** — Upcoming (day-grouped with week strip), All tasks, Priority, Folders, Labels, Completed
- **Priority levels** — Urgent / Important / Normal with color-coded flags and dedicated sidebar navigation
- **Task hierarchy** — subtasks with expand/collapse (synced across devices) and drag-and-drop reordering
- **Deadlines** — date + optional time, color-coded: overdue (red) / today (green) / tomorrow (orange) / this week (violet)
- **Recurring tasks** — daily / weekly / monthly; completing advances the deadline automatically
- **Labels & Folders** — organize tasks with colored labels and folders; both collapsible in the sidebar
- **Offline-first** — full read/write without internet via IndexedDB; syncs automatically on reconnect
- **Cross-device preferences** — sidebar section collapse state synced to Google Sheets
- **PWA** — installable on Android and iOS, works as a standalone app with its own icon

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript 5 |
| Build | Vite 7 |
| Styling | Tailwind CSS v3 + shadcn/ui |
| State | Zustand 5 |
| Database | Google Sheets API v4 |
| Auth | Google Identity Services (OAuth 2.0) |
| Offline storage | Dexie.js (IndexedDB) |
| Drag & drop | @dnd-kit |
| Dates | date-fns |
| PWA | vite-plugin-pwa (Workbox) |
| Hosting | Vercel |

## Setup

### Prerequisites

- Google account
- Google Cloud project with **Google Sheets API v4** and **Google Drive API v3** enabled
- OAuth 2.0 Client ID (type: Web application)
- Node.js ≥ 18

### Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Google Sheets API v4**
3. Enable **Google Drive API**
4. Create an **OAuth 2.0 Client ID** → type: Web application
5. Add to **Authorized JavaScript origins** (not Redirect URIs):
   ```
   http://localhost:5173
   https://your-app.vercel.app
   ```
6. Add your Google account as a **test user** in the OAuth consent screen

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
2. Add environment variables in project Settings → Environment Variables:
   - `VITE_GOOGLE_CLIENT_ID`
3. Every push to `main` triggers automatic deployment

## Data Model

Data is stored in a Google Spreadsheet with four sheets:

| Sheet | Columns |
|---|---|
| `tasks` | id, parent_id, folder_id, title, status, priority, deadline_date, deadline_time, is_recurring, recur_type, recur_value, labels, sort_order, created_at, updated_at, completed_at, is_expanded |
| `folders` | id, name, color, sort_order, created_at, updated_at |
| `labels` | id, name, color, created_at, updated_at |
| `settings` | A1 — JSON blob with user preferences (sidebar section collapse state) |

On first launch the app creates the spreadsheet and all four sheets automatically.

## Install as Mobile App

**Android:** Chrome prompts automatically, or use the browser menu → *Install app*

**iOS:** Safari → Share button → *Add to Home Screen*

## Technical Documentation

See [`docs/stler-tasks-technical-doc.pdf`](docs/stler-tasks-technical-doc.pdf) for the full technical reference covering architecture, data model, state management, API layer, sync/offline strategy, and deployment.
