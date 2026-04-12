const PDFDocument = require('pdfkit')
const fs = require('fs')

const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: false })
doc.pipe(fs.createWriteStream('docs/stler-tasks-technical-doc.pdf'))

const ORANGE = '#e07e38'
const DARK   = '#1c1c1c'
const GRAY   = '#555555'
const LGRAY  = '#888888'
const LINE   = '#e0e0e0'
const WHITE  = '#ffffff'

const W = 595.28
const H = 841.89
const M = 56

// ─── helpers ─────────────────────────────────────────────────────────────────

function h1(text) {
  doc.moveDown(0.8)
  doc.fontSize(18).fillColor(ORANGE).font('Helvetica-Bold').text(text, M, doc.y)
  doc.moveDown(0.25)
  const y = doc.y
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(ORANGE).lineWidth(1).stroke()
  doc.moveDown(0.4)
}

function h2(text) {
  doc.moveDown(0.4)
  doc.fontSize(12).fillColor(DARK).font('Helvetica-Bold').text(text, M, doc.y)
  doc.moveDown(0.2)
}

function body(text) {
  doc.fontSize(10).fillColor(DARK).font('Helvetica').text(text, M, doc.y, { align: 'justify', width: W - M * 2 })
  doc.moveDown(0.25)
}

function bullet(items) {
  for (const item of items) {
    doc.fontSize(10).fillColor(DARK).font('Helvetica')
      .text('\u2022  ' + item, M + 12, doc.y, { width: W - M * 2 - 12 })
  }
  doc.moveDown(0.25)
}

function kv(key, value) {
  const y = doc.y
  doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK)
    .text(key + ':', M + 12, y, { width: 140, lineBreak: false })
  doc.fontSize(10).font('Helvetica').fillColor(GRAY)
    .text(value, M + 160, y, { width: W - M - 160 - M })
  doc.moveDown(0.05)
}

function mono(lines) {
  const blockH = lines.length * 13 + 14
  doc.rect(M, doc.y, W - M * 2, blockH).fillColor('#f4f4f4').fill()
  const startY = doc.y + 7
  for (let i = 0; i < lines.length; i++) {
    doc.fontSize(8).fillColor('#222').font('Courier')
      .text(lines[i], M + 10, startY + i * 13, { width: W - M * 2 - 20, lineBreak: false })
  }
  doc.y = startY + lines.length * 13 + 9
  doc.moveDown(0.2)
}

function divider() {
  doc.moveDown(0.3)
  doc.moveTo(M, doc.y).lineTo(W - M, doc.y).strokeColor(LINE).lineWidth(0.5).stroke()
  doc.moveDown(0.3)
}

function ensureSpace(needed) {
  if (doc.y + needed > H - 50) {
    doc.addPage({ margin: 0, size: 'A4' })
    doc.y = 56
  }
}

// ─── COVER PAGE ──────────────────────────────────────────────────────────────

doc.addPage({ margin: 0, size: 'A4' })
doc.rect(0, 0, W, H).fillColor(DARK).fill()
doc.rect(0, H / 2 - 2, W, 3).fillColor(ORANGE).fill()

doc.fontSize(56).fillColor(ORANGE).font('Helvetica-Bold').text('Stler Tasks', M, 210, { width: W - M * 2 })
doc.fontSize(22).fillColor(WHITE).font('Helvetica').text('Technical Specification', M, 290, { width: W - M * 2 })

doc.fontSize(11).fillColor(LGRAY).font('Helvetica')
  .text('Personal PWA  \u00b7  React + TypeScript  \u00b7  Google Sheets API', M, H / 2 + 18, { width: W - M * 2 })
doc.fontSize(10).fillColor(LGRAY)
  .text('Offline-first  \u00b7  IndexedDB  \u00b7  Mobile-first', M, H / 2 + 38, { width: W - M * 2 })

doc.fontSize(9).fillColor(LGRAY)
  .text('Version 1.0  \u00b7  April 2026', M, H - 72, { width: W - M * 2 })

// ─── TABLE OF CONTENTS ───────────────────────────────────────────────────────

doc.addPage({ margin: 0, size: 'A4' })
doc.y = 56

doc.fontSize(26).fillColor(ORANGE).font('Helvetica-Bold').text('Contents', M, doc.y)
doc.moveDown(0.3)
doc.rect(M, doc.y, W - M * 2, 2).fillColor(ORANGE).fill()
doc.moveDown(0.9)

const toc = [
  ['1.', 'Project Overview'],
  ['2.', 'Goals & Non-Goals'],
  ['3.', 'Technology Stack'],
  ['4.', 'Application Architecture'],
  ['5.', 'Data Model'],
  ['6.', 'Features'],
  ['7.', 'Authentication'],
  ['8.', 'Offline Support'],
  ['9.', 'UI & Theme'],
  ['10.', 'PWA & Mobile'],
  ['11.', 'Setup & Deployment'],
  ['12.', 'Key File Structure'],
]

for (const [num, title] of toc) {
  const y = doc.y
  doc.fontSize(12).fillColor(ORANGE).font('Helvetica-Bold').text(num, M, y, { width: 36, lineBreak: false })
  doc.fontSize(12).fillColor(DARK).font('Helvetica').text(title, M + 40, y, { width: W - M * 2 - 40 })
  doc.moveDown(0.55)
}

// ─── CONTENT ─────────────────────────────────────────────────────────────────

doc.addPage({ margin: 0, size: 'A4' })
doc.y = 56

// 1
h1('1. Project Overview')
body(
  'Stler Tasks is a personal productivity application built as a Progressive Web App (PWA). ' +
  'It runs in any modern browser and can be installed on Android or iOS home screens for a native-like ' +
  'experience without an app store. There is no backend \u2014 Google Sheets is used directly as the ' +
  'database via the Sheets API v4, authentication is handled client-side through Google Identity ' +
  'Services (OAuth 2.0), and IndexedDB provides offline-first data access with automatic sync on reconnect.'
)
divider()

// 2
h1('2. Goals & Non-Goals')
h2('Goals')
bullet([
  'Fully functional task manager accessible from any device via browser or installed PWA',
  'No backend server required \u2014 Google Sheets acts as the data store',
  'Offline support: full read/write while offline, auto-sync on reconnect',
  'Single user (personal use); authentication via Google OAuth 2.0',
  'Responsive design: desktop sidebar layout + mobile bottom-sheet drawer layout',
])
h2('Non-Goals')
bullet([
  'Multi-user collaboration or sharing',
  'Native app distribution via App Store / Google Play',
  'Real-time push notifications',
  'Server-side rendering or a backend API',
])
divider()

// 3
ensureSpace(220)
h1('3. Technology Stack')
h2('Frontend')
kv('Framework', 'React 18 + TypeScript 5')
kv('Build Tool', 'Vite 7')
kv('Styling', 'Tailwind CSS v3 + shadcn/ui (Radix UI primitives)')
kv('State Management', 'Zustand 5 with persist middleware')
kv('Form Handling', 'React Hook Form + Zod')
kv('Drag & Drop', '@dnd-kit/core + @dnd-kit/sortable')
kv('Icons', 'Lucide React')
kv('Date Utilities', 'date-fns')
doc.moveDown(0.3)
h2('Data & Auth')
kv('Database', 'Google Sheets API v4 (spreadsheet as DB, direct browser fetch)')
kv('File Discovery', 'Google Drive API v3 (find or create db_tasks spreadsheet)')
kv('Authentication', 'Google Identity Services \u2014 OAuth 2.0 Token Client')
kv('Offline Storage', 'Dexie.js (IndexedDB wrapper)')
kv('Sync Queue', 'Custom offline queue with deduplication')
doc.moveDown(0.3)
h2('PWA & Deployment')
kv('PWA Plugin', 'vite-plugin-pwa (Workbox)')
kv('Hosting', 'Vercel (auto-deploy from GitHub)')
kv('Production URL', 'https://stler-tasks.vercel.app')
kv('Env var', 'VITE_GOOGLE_CLIENT_ID (only required variable)')
divider()

// 4
ensureSpace(200)
h1('4. Application Architecture')
body('The app follows a layered architecture with clear separation between UI, state, data access, and sync services.')
h2('Layer Overview')
bullet([
  'UI Layer \u2014 React components (src/components/)',
  'State Layer \u2014 Zustand stores (src/store/): tasks, folders, labels, ui, auth, sync',
  'Service Layer \u2014 syncService, authService, recurrenceService (src/services/)',
  'API Layer \u2014 Google Sheets REST wrappers (src/api/): tasksApi, foldersApi, labelsApi',
  'DB Layer \u2014 Dexie.js IndexedDB (src/services/db.ts)',
])
h2('Data Flow: Online')
body('User action \u2192 Zustand store update \u2192 IndexedDB write + enqueue \u2192 scheduleFlush() \u2192 Sheets API write')
h2('Data Flow: Offline')
body('User action \u2192 Zustand store update \u2192 IndexedDB write \u2192 offline queue stores op \u2192 on reconnect: flush() sends to Sheets')
h2('Sync Strategy')
bullet([
  'initialLoad() \u2014 on app start, fetches all data from Sheets into IndexedDB',
  'enqueue() \u2014 adds CRUD operation to offline queue',
  'scheduleFlush() \u2014 debounced 800 ms; safe to call after every drag/edit',
  'flush() \u2014 deduplicates by (entityType, entityId, operationType); sends only the latest op per entity',
  'fullSync() \u2014 complete read from Sheets + local reconciliation (last-write-wins by updated_at)',
])
divider()

// 5
ensureSpace(260)
h1('5. Data Model')
body(
  'All data lives in the user\u2019s Google Spreadsheet named \u201cdb_tasks\u201d (found or auto-created on first login). ' +
  'It contains four sheets: tasks, folders, labels, settings. ' +
  'Column A of each data sheet contains a header row for schema identification.'
)
h2('tasks sheet  (columns A\u2013Q, 17 fields)')
mono([
  'A  id            tsk-xxxxxxxx  (8 random hex chars)',
  'B  parent_id     FK to tasks.id  (empty = root task)',
  'C  folder_id     FK to folders.id  (fld-inbox = Inbox)',
  'D  title         task text',
  'E  status        pending | completed',
  'F  priority      urgent | important | normal',
  'G  deadline_date YYYY-MM-DD  (or empty)',
  'H  deadline_time HH:MM  (or empty)',
  'I  is_recurring  TRUE | FALSE',
  'J  recur_type    days | weeks | months  (or empty)',
  'K  recur_value   integer interval  (default 1)',
  'L  labels        comma-separated label IDs',
  'M  sort_order    integer position within folder + parent group',
  'N  created_at    ISO datetime string',
  'O  updated_at    ISO datetime string',
  'P  completed_at  ISO datetime string  (or empty)',
  'Q  is_expanded   TRUE | FALSE  (subtask expand state)',
])
h2('folders sheet  (columns A\u2013F)')
mono([
  'A  id (fld-xxxxxxxx)  |  B  name  |  C  color (hex)  |  D  sort_order  |  E  created_at  |  F  updated_at',
])
h2('labels sheet  (columns A\u2013E)')
mono([
  'A  id (lbl-xxxxxxxx)  |  B  name  |  C  color (hex)  |  D  created_at  |  E  updated_at',
])
h2('settings sheet')
body('A1 \u2014 JSON blob with user preferences (sidebar section collapse state per view).')
h2('Special Constants')
bullet([
  'INBOX_FOLDER_ID = "fld-inbox" \u2014 always-present default folder, cannot be deleted',
  'ID format: "tsk-" / "fld-" / "lbl-" prefix + 8 random hex characters',
])
divider()

// 6
ensureSpace(120)
h1('6. Features')
h2('Views (Sidebar Navigation)')
bullet([
  'Upcoming \u2014 tasks with a deadline, day-grouped: Overdue / Today / Tomorrow / This week / Later. Priority + label filters. Flat list.',
  'All Tasks \u2014 all pending tasks across all folders. Flat list.',
  'Completed \u2014 completed tasks in reverse-chronological order.',
  'Priority views \u2014 3 flag buttons (Urgent / Important / Normal). Flat list filtered by priority.',
  'Folder views \u2014 one entry per folder (Inbox always first). Full hierarchy with subtasks and drag-and-drop.',
  'Label views \u2014 one entry per label. Tasks tagged with that label.',
])

ensureSpace(160)
h2('Task Item: Two-Row Design')
bullet([
  'Row 1: expand/collapse toggle (if subtasks exist), checkbox, title, action icons.',
  'Row 2 (shown when data present): recurring indicator, deadline date/time, label chips, folder name.',
  'Deadline colors: Overdue=red, Today=green, Tomorrow=orange, This week=violet, Future=muted.',
  'Completing a task with subtasks also completes all pending descendants recursively.',
])
h2('Action Icons')
bullet([
  'Desktop (\u2265768px): Clock, Flag (priority), Tag (labels), Plus (subtask), Pencil (edit), Trash \u2014 always visible.',
  'Mobile (<768px): Clock, Flag, \u2026 dropdown with: Labels / Add subtask / Edit / Delete.',
])

ensureSpace(200)
h2('Task Create / Edit')
bullet([
  'Title field supports @FolderName and #LabelName tokens \u2014 parsed on save and stripped from title.',
  'Priority: Urgent / Important / Normal (pill buttons).',
  'Labels: color chip multi-select + inline "New label" creator.',
  'Due date + due time fields.',
  'Recurring: checkbox + interval (every N days/weeks/months).',
  'Folder auto-resolved from current view; editable via @-token in title.',
])
h2('Recurring Tasks')
bullet([
  'On complete: deadline_date advances by recur_value \u00d7 recur_type. Status stays "pending".',
  '"Postpone" in Set Deadline dialog manually advances to next occurrence.',
  '"No date" clears deadline, time, and recurring settings together.',
])
h2('Hierarchy & Drag-and-Drop')
bullet([
  'Tasks support one level of parent-child nesting (parent_id field).',
  'Subtasks rendered indented under parent in Folder view with their own DnD context.',
  'Root-level and subtask-level reordering via @dnd-kit.',
  'sort_order persisted via scheduleFlush() after every drag.',
])

ensureSpace(120)
h2('Upcoming View Filters')
bullet([
  'Priority chips (Urgent / Important / Normal) and label chips in a single flex-wrap row.',
  'Filters combined with AND logic.',
])
h2('Folders & Labels Management')
bullet([
  'Create / rename / delete via inline forms in sidebar.',
  'Delete folder: all tasks moved to Inbox first.',
  'Delete label: label ID stripped from all tasks.',
  'Color picker with preset swatches.',
])
divider()

// 7
ensureSpace(220)
h1('7. Authentication')
body(
  'Uses Google Identity Services (GIS) Token Client \u2014 OAuth 2.0 implicit flow. ' +
  'Only Authorized JavaScript Origins must be configured; no redirect URIs needed.'
)
h2('Silent Sign-In Flow')
bullet([
  'On app load: requestAccessToken({ prompt: "" }) \u2014 no UI if previously authorised.',
  'login_hint set to stored user email to avoid account picker on return visits.',
  'User profile (name, email, avatar) fetched from /oauth2/v3/userinfo after token received.',
  'On any 401: silent token refresh attempted once before showing error.',
])
h2('Token Lifecycle')
bullet([
  'Access token kept in memory \u2014 never written to localStorage.',
  'Lifetime: 1 hour (standard GIS implicit grant).',
  'spreadsheetId stored in localStorage so the db_tasks file is found without a Drive search every session.',
  'Sign-out clears token, expiry, user profile, and spreadsheetId from localStorage.',
])
h2('Required OAuth Scopes')
bullet([
  'email, profile \u2014 user identity',
  'https://www.googleapis.com/auth/spreadsheets \u2014 read/write db_tasks',
  'https://www.googleapis.com/auth/drive.metadata.readonly \u2014 find file in Drive',
])
divider()

// 8
ensureSpace(220)
h1('8. Offline Support')
body(
  'The app is fully functional without internet. IndexedDB (Dexie.js) stores all tasks, folders, ' +
  'and labels locally. An offline queue records every write operation while disconnected.'
)
h2('Offline Queue')
bullet([
  'IndexedDB table stores: entityType, entityId, operationType, payload, createdAt.',
  'flush() deduplicates by (entityType:entityId:operationType) \u2014 only the latest op per entity is sent to Sheets.',
  'scheduleFlush(): debounced 800 ms; _flushing guard prevents concurrent flushes.',
  'Conflict resolution: last-write-wins by updated_at timestamp.',
])
h2('Service Worker (Workbox)')
bullet([
  'Precaches all static assets (JS, CSS, HTML, icons).',
  'Google Sheets API: NetworkFirst strategy, 10 s timeout, fallback to cache.',
  'Google Identity Services: NetworkOnly (auth requires internet).',
  'registerType: autoUpdate \u2014 new SW installs silently in the background.',
])
divider()

// 9
ensureSpace(200)
h1('9. UI & Theme')
h2('Color Palette (CSS Variables / HSL)')
mono([
  'Token                  Light                Dark',
  '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
  '--background           0 0% 99%             0 0% 11%',
  '--foreground           0 0% 11%             0 0% 93%',
  '--card / --popover     0 0% 100%            0 0% 21%',
  '--primary              25 75% 55%           25 75% 55%   (#e07e38)',
  '--muted / --secondary  0 0% 95%             0 0% 21%',
  '--accent               25 75% 55%/10%       25 75% 55%/15%',
  '--border               0 0% 91%             0 0% 29%',
  '--destructive          0 70% 67%            0 55% 58%',
])
h2('Typography')
bullet([
  'System font stack (Segoe UI, system-ui, -apple-system, sans-serif).',
  'Minimum font size: 1 rem everywhere (xs and sm Tailwind tokens both map to 1 rem).',
  'Respects device font size scaling via rem.',
])
h2('Responsive Layout')
bullet([
  'Desktop (\u2265768px): fixed left sidebar 256px wide + scrollable main content.',
  'Mobile (<768px): sidebar opens as a left Sheet drawer; closes on view selection.',
  'Header bar: menu icon (mobile only), current view title, user avatar + sign-out dropdown.',
])
h2('Dialogs on Mobile')
bullet([
  'Pinned to top of screen (not centered) \u2014 stays visible above the software keyboard.',
  'Slides in from top; full width with rounded bottom corners.',
  'On desktop (\u2265sm): centered with zoom + slide animation.',
])
divider()

// 10
ensureSpace(160)
h1('10. PWA & Mobile')
bullet([
  'manifest.json: name \u201cStler Tasks\u201d, short_name \u201cTasks\u201d, display standalone, theme_color #e07e38.',
  'Icons: icon-192.png and icon-512.png \u2014 orange background, checkbox + list design.',
  'Service worker precaches app shell; Sheets API uses NetworkFirst with cache fallback.',
  'Android: Chrome shows automatic install banner.',
  'iOS: Safari Share \u2192 Add to Home Screen.',
  'Installed PWA opens full-screen without browser chrome.',
  'safe-area-inset-* and dvh units used for correct layout on notched devices.',
])
divider()

// 11
ensureSpace(240)
h1('11. Setup & Deployment')
h2('Local Development')
mono([
  '1.  git clone https://github.com/JuliaSivridi/Tasks.git',
  '2.  npm install',
  '3.  Create .env:',
  '      VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com',
  '4.  npm run dev   ->  http://localhost:5173',
  '5.  npm run build ->  dist/',
])
h2('Google Cloud Console')
bullet([
  'Enable Google Sheets API v4 and Google Drive API v3.',
  'Create OAuth 2.0 Client ID \u2014 type: Web application.',
  'Authorized JavaScript Origins: http://localhost:5173 + production URL.',
  'OAuth consent screen: Testing mode; add your Google account as test user.',
])
h2('Vercel Deployment')
bullet([
  'Import repo at vercel.com; add VITE_GOOGLE_CLIENT_ID env var.',
  'Every push to main auto-deploys; add Vercel URL to Google Cloud Origins.',
  'No backend to provision \u2014 db_tasks spreadsheet auto-created on first login.',
])
h2('First Run')
body(
  'On first login, ensureSpreadsheet() searches Google Drive for a file named \u201cdb_tasks\u201d. ' +
  'If not found, it creates a new spreadsheet with four sheets (tasks, folders, labels, settings) ' +
  'and a default Inbox folder. The spreadsheet ID is saved to localStorage for all subsequent sessions.'
)
divider()

// 12
ensureSpace(280)
h1('12. Key File Structure')
mono([
  'src/',
  '  api/              tasksApi.ts  foldersApi.ts  labelsApi.ts  sheetsClient.ts',
  '                    spreadsheetSetup.ts',
  '  components/',
  '    layout/         AppShell.tsx  Header.tsx  Sidebar.tsx  LoginPage.tsx',
  '    tasks/          TaskList.tsx  TaskItem.tsx  TaskChildren.tsx',
  '                    TaskCreateModal.tsx  TimePickerDialog.tsx',
  '    ui/             shadcn/ui components (button, dialog, sheet, checkbox ...)',
  '    common/         ConfirmDialog.tsx',
  '  hooks/            useTasks.ts  useSync.ts',
  '  services/         db.ts  syncService.ts  authService.ts',
  '                    offlineQueue.ts  recurrenceService.ts',
  '  store/            tasksStore.ts  foldersStore.ts  labelsStore.ts',
  '                    uiStore.ts  authStore.ts  syncStore.ts',
  '  types/            task.ts  folder.ts  label.ts',
  '  utils/            dateUtils.ts  constants.ts  uuid.ts',
  'public/icons/       icon-192.png  icon-512.png  icon.svg',
  'docs/               stler-tasks-technical-doc.pdf  technical-doc.html',
  'index.html          meta theme-color, favicon, page title "Tasks"',
  'vite.config.ts      PWA manifest, Workbox caching strategies',
  'generate-spec.cjs   generates docs/stler-tasks-technical-doc.pdf',
  '.env                VITE_GOOGLE_CLIENT_ID  (not committed to git)',
])

doc.end()
console.log('Done: docs/stler-tasks-technical-doc.pdf')
