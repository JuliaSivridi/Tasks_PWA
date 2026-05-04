# Tasks PWA — Backlog

> Based on Android spec v2.1 (`docs/tech-spec-android.md`).  
> Effort: **S** = ~1h · **M** = ~2-4h · **L** = ~5-8h

---

## Group A — Form UI Fixes (non-calendar)

Aligns `TaskCreateModal` and `TimePickerDialog` with Android's `TaskFormSheet` (spec §10).

| ID | Title | Effort | Status | Deps |
|----|-------|--------|--------|------|
| A-01 | Add `'years'` to `recur_type` + RepeatRow "year(s)" option | S | [ ] | — |
| A-02 | Smart title parsing (`@Folder`, `#Label`, `!1`/`!2`/`!3` tokens) | S | [ ] | — |
| A-03 | Restructure TASK mode fields: Folder chip → picker dialog; Labels row → LabelPickerSheet; Priority chips | M | [ ] | — |
| A-04 | Clear + Postpone buttons in TaskCreateModal (edit mode) | S | [ ] | A-01 |
| A-05 | TimePickerDialog: Clear clears date AND time; hide time/repeat chips when no date selected | S | [ ] | A-01 |

### A-01 — 'years' recur_type
- `src/types/task.ts` — add `'years'` to `recur_type` union
- `src/components/tasks/TaskCreateModal.tsx` + `TimePickerDialog.tsx` — add "year(s)" to frequency `<Select>`
- `src/utils/dateUtils.ts` — handle `addYears` in deadline-advance logic

### A-02 — Smart title parsing
- **Create** `src/utils/smartTitle.ts`
  - `parseSmartTitle(title, folders, labels, currentFolderId, currentLabelIds)` → `{ title, folderId, labelIds, priority? }`
  - `@FolderName` case-insensitive → sets folderId; token stripped
  - `#LabelName` case-insensitive → adds to labelIds; token stripped
  - `!1`/`!2`/`!3` → urgent/important/normal priority; token stripped
  - Unmatched tokens left in title; multiple spaces collapsed
- `src/components/tasks/TaskCreateModal.tsx` — call `parseSmartTitle` inside `handleSubmit` before `addTask`/`updateTask`

### A-03 — Restructure TASK mode fields
- **Folder**: replace `<Select>` with a chip (folder.color @ 18% alpha bg, folder name); click opens `FolderPickerDialog` (Alert dialog, radio-style rows, Check icon on selected)
- **Labels**: replace inline creator with clickable row "Labels [N] ›" that opens `LabelPickerSheet`; selected labels shown as chips with × to remove; keep existing label-create inside the sheet
- **Priority**: 3 chips; unselected shows Flag icon, selected shows Check; chip bg = priority color @ 18% alpha
- **Field order** (TASK mode): Title → Deadline + Time → Repeat → Folder → Labels → Priority

### A-04 — Clear + Postpone buttons
- **Clear**: visible when `isEditing && (deadlineDate || deadlineTime)`. Resets deadline date, time, isRecurring, recurType, recurValue immediately.
- **Postpone**: visible when `isEditing && isRecurring && deadlineDate`. Advances `deadlineDate` by `recurValue × recurType` using date-fns (`addDays`/`addWeeks`/`addMonths`/`addYears`).
- Buttons on the **left** side of buttons row (Cancel/Save on right).

### A-05 — TimePickerDialog fixes
- **"Clear"**: currently only clears date — must also clear time. Hidden when both are blank.
- **Time chip**: hidden when `selectedDate` is blank (spec §9.4).
- **Repeat row**: hidden when `selectedDate` is blank.
- **Postpone** button (same as A-04, for quick reschedule from the picker).

---

## Group B — Calendar Foundation

| ID | Title | Effort | Status | Deps |
|----|-------|--------|--------|------|
| B-01 | `CalendarEvent` + `CalendarItem` TypeScript types | S | [ ] | — |
| B-02 | Add `calendar` OAuth scope to `authService.ts` | S | [ ] | — |
| B-03 | `calendarApi.ts` — listCalendars, listEvents, CRUD, getEvent | M | [ ] | B-01, B-02 |
| B-04 | Dexie v2 schema — add `calendarEvents` table | S | [ ] | B-01 |
| B-05 | `calendarStore.ts` — Zustand store for events + calendars list | M | [ ] | B-01, B-04 |
| B-06 | `calendarEnabled` + `enabledCalendarIds` in `prefsStore.ts` | S | [ ] | — |

### B-01 — CalendarEvent type
**Create** `src/types/calendarEvent.ts`:
```ts
export interface CalendarEvent {
  id: string
  calendarId: string
  calendarName: string   // denormalised at fetch time
  calendarColor: string  // hex, e.g. "#039be5"
  title: string
  startDate: string      // "YYYY-MM-DD"
  startTime: string      // "HH:MM" or "" (all-day)
  endTime: string        // "HH:MM" or ""
  isAllDay: boolean
  recurringEventId: string | null
}
export interface CalendarItem {
  id: string
  summary: string
  color: string
  isSelected: boolean
  accessRole: string
}
```

### B-02 — OAuth scope
- `src/services/authService.ts` — append `'https://www.googleapis.com/auth/calendar'` to SCOPES array
- Existing users will get incremental consent on next auth when they enable Calendar in Settings

### B-03 — calendarApi.ts
**Create** `src/api/calendarApi.ts`:
- Private `calendarRequest<T>(method, url, body?)` — same pattern as `driveApi.ts` (Bearer token from authStore, retry once on 401 via `refreshToken()`)
- `BASE = 'https://www.googleapis.com/calendar/v3'`
- `listCalendars()` — GET `/users/me/calendarList` → `CalendarItem[]`
- `listEvents(calendarId, timeMin, timeMax)` — GET `/calendars/{id}/events?singleEvents=true&orderBy=startTime`; handle `nextPageToken` pagination; denormalise `calendarName` + `calendarColor` from the matching list entry; parse each event to `CalendarEvent`
- `createEvent(calendarId, body)`, `updateEvent(calendarId, eventId, body)`, `deleteEvent(calendarId, eventId)`
- `getEvent(calendarId, eventId)` — GET single event (used to fetch base/series event when editing a recurring instance)

### B-04 — Dexie v2 schema
`src/services/db.ts`:
```ts
// Add property:
calendarEvents!: Table<CalendarEvent>

// Add AFTER existing version(1) block:
this.version(2).stores({
  calendarEvents: '&id, startDate, calendarId',
})
```

### B-05 — calendarStore
**Create** `src/store/calendarStore.ts` (Zustand, no `persist` — Dexie is the durable cache):
```ts
{
  events: CalendarEvent[]      // in-memory, loaded from Dexie on startup
  calendars: CalendarItem[]    // ephemeral, re-fetched on each pull
  isLoading: boolean

  setEvents(events)    // bulk replace memory + db.calendarEvents.bulkPut()
  upsertEvent(event)   // memory + db.calendarEvents.put()
  removeEvent(id)      // filter memory + db.calendarEvents.delete(id)
  setCalendars(cals)   // memory only
  loadFromDb()         // db.calendarEvents.toArray() → set events (offline fallback)
}
```

### B-06 — calendarEnabled in prefsStore
`src/store/prefsStore.ts` — add to state and persist:
```ts
calendarEnabled: boolean        // default false
enabledCalendarIds: string[]    // default []
setCalendarEnabled(v: boolean)
setEnabledCalendarIds(ids: string[])
```

---

## Group C — Sync

| ID | Title | Effort | Status | Deps |
|----|-------|--------|--------|------|
| C-01 | `pullCalendar()` in `syncService.ts` — fetch events into calendarStore + Dexie | M | [ ] | B-03, B-05, B-06 |
| C-02 | `useSync.ts` — re-pull calendar when `calendarEnabled` flips to true | S | [ ] | C-01 |

### C-01 — pullCalendar()
`src/services/syncService.ts` — add:
```ts
async function pullCalendar() {
  const { calendarEnabled, enabledCalendarIds } = prefsStore.getState()
  if (!calendarEnabled) return
  const timeMin = startOfToday().toISOString()
  const timeMax = addDays(new Date(), 30).toISOString()
  const cals = await listCalendars()
  calendarStore.setCalendars(cals)
  const all = (await Promise.all(
    enabledCalendarIds.map(id => listEvents(id, timeMin, timeMax))
  )).flat()
  calendarStore.setEvents(all)
}
```
- Call `await pullCalendar()` in `initialLoad()` and `fullSync()` **after** existing `pull()`
- Wrap in try/catch: on failure, call `calendarStore.loadFromDb()` (offline fallback)
- Calendar events are **never** queued — no changes to `flush()` or `offlineQueue`

### C-02 — useSync re-pull on toggle
`src/hooks/useSync.ts`:
```ts
useEffect(() => {
  if (calendarEnabled) pullCalendar()
}, [calendarEnabled])
```

---

## Group D — Settings UI

| ID | Title | Effort | Status | Deps |
|----|-------|--------|--------|------|
| D-01 | Calendars section in `SettingsPage.tsx` | M | [ ] | B-03, B-05, B-06, C-01 |

### D-01 — Calendars section
`src/components/settings/SettingsPage.tsx` — add below Spreadsheet section (same card style):
- **Toggle row**: "Show Google Calendar events" + switch (`calendarEnabled`)
  - When toggled on: `listCalendars()` → `setCalendars()` → `pullCalendar()`
- **Calendar list** (visible when enabled): each `CalendarItem` with:
  - `CalendarDays` icon tinted with `cal.color` (the icon IS the color indicator)
  - Calendar name
  - Checkbox; toggling calls `setEnabledCalendarIds([...updated])`
- **Refresh** icon button in section header — re-fetches calendar list from API
- Loading spinner while fetching (local `useState`)
- Only calendars with `isSelected = true` are synced (spec §8.10)
- On 403 (scope not yet granted): inline "Additional permission required — sign in again" with re-auth button

---

## Group E — CalendarEventItem Component

| ID | Title | Effort | Status | Deps |
|----|-------|--------|--------|------|
| E-01 | `CalendarEventItem.tsx` — event row (icon in checkbox slot, Schedule + MoreHoriz buttons) | M | [ ] | B-01, B-05 |

### E-01 — CalendarEventItem
**Create** `src/components/calendar/CalendarEventItem.tsx`:

**Row 1** (spec §8.8):
```
[40dp expand spacer] [40dp: CalendarDays icon 24dp tinted calendarColor] [title flex-1] [Schedule btn] [MoreHoriz btn]
```
- The 40dp icon box is in the **same slot as the checkbox** in TaskItem — the CalendarDays icon tinted with `calendarColor` IS this slot's content
- **Schedule btn** (`Clock` / `Schedule` icon, 18dp): opens `TimePickerDialog` in schedule-only mode (date + start time + end time for the event); `onEditSchedule` callback
- **MoreHoriz btn** (three-dots, 18dp): dropdown with "Edit" → `onEdit()` and "Delete" → triggers delete dialog

**Row 2** (54dp indent, spec §8.8):
```
[timeLabel]  [CalendarDays icon 14dp tinted calendarColor]  [calendarName]
```
- `timeLabel` rules:
  - Timed event: `"HH:MM – HH:MM"` (or `"HH:MM"` if no endTime)
  - All-day + `showDate=true`: `"d MMM"` / `"Today"` / `"Tomorrow"`
  - All-day + `showDate=false` (Upcoming/Calendar views): **empty string** — nothing rendered

**Deletion dialogs**:
- Non-recurring: `<AlertDialog>` "Delete event?" with Delete (destructive) / Cancel
- Recurring: `<AlertDialog>` with 3 options — "Delete this event only" / "Delete all events in series" (error color) / "Cancel"

**Props**: `event: CalendarEvent`, `showDate: boolean`, `onEdit: () => void`, `onEditSchedule: () => void`, `onDelete: () => void`, `onDeleteSeries: () => void`

---

## Group F — Views Integration

| ID | Title | Effort | Status | Deps |
|----|-------|--------|--------|------|
| F-01 | `useTasks.ts` — `useUpcomingGroupsWithEvents()` + `useCalendarEvents(calendarId)` | M | [ ] | B-01, B-05 |
| F-02 | `FilterBar` — calendar filter chip + filter matrix logic | M | [ ] | B-01, B-05, F-01 |
| F-03 | `UpcomingView` — render merged task+event list | S | [ ] | E-01, F-01, F-02 |
| F-04 | `AllTasksView` — render events merged with tasks | S | [ ] | E-01, F-01, F-02 |

### F-01 — useUpcomingGroupsWithEvents() + useCalendarEvents()
`src/hooks/useTasks.ts`:

**`useUpcomingGroupsWithEvents()`** — merges tasks + events into day buckets:
```ts
type MergedItem = { type: 'task'; task: Task } | { type: 'event'; event: CalendarEvent }
```
- **Sort within each bucket** (spec §8.1):
  1. Timed items (task with `deadline_time` or event with `startTime`) — ascending by time string
  2. All-day items (no time) — AFTER all timed items
  - Tasks and events are NOT grouped separately — they are sorted together by the above rules
- `datesWithContent` set includes dates from both tasks and events (for WeekStrip dots)

**`useCalendarEvents(calendarId: string)`** — for the Calendar event list view:
- Returns events from `calendarStore.events` filtered by `calendarId`
- Sorted by `startDate` ascending, then `startTime` ascending

### F-02 — FilterBar calendar chip
`src/components/tasks/TaskList.tsx` (FilterBar component):
- Add `calendarFilter: string[]` to FilterBar state
- Calendar chip: `CalendarDays` icon; shown when `calendarStore.calendars.length > 0`; opens dropdown with calendar list; each calendar: icon tinted with `cal.color` + name; multi-select
- **Filter matrix** (spec §8.1):
  ```
  taskFiltersActive = priority OR label OR folder filter non-empty
  calFiltersActive  = calendarFilter non-empty

  tasks shown:  if calFiltersActive && !taskFiltersActive → NONE
                else → filtered by priority ∩ label ∩ folder

  events shown: if calFiltersActive → filtered by calendarId ∈ calendarFilter
                if taskFiltersActive → NONE
                else → all events
  ```

### F-03 — UpcomingView merged render
- Switch to `useUpcomingGroupsWithEvents()`
- In group render loop: `item.type === 'task'` → `<TaskItem>`, `item.type === 'event'` → `<CalendarEventItem showDate={false} ...>`
- Pass updated `datesWithContent` to WeekStrip
- Calendar events are NOT filtered by the task FilterBar (only by calendarFilter)

### F-04 — AllTasksView show events
- Merge tasks (all pending) + events (today..today+366) using same sort rules as F-01
- `<CalendarEventItem showDate={true} ...>` (no date-group headers in AllTasksView — flat sorted list)
- Apply filter matrix from F-02

---

## Group G — Calendar Event List View

| ID | Title | Effort | Status | Deps |
|----|-------|--------|--------|------|
| G-01 | `uiStore.ts` — add `'calendar'` view + `selectedCalendarId` | S | [ ] | — |
| G-02 | `Sidebar.tsx` — Calendars collapsible section | S | [ ] | B-05, B-06, G-01 |
| G-03 | `Header.tsx` — calendar name as title for calendar view | S | [ ] | G-01 |
| G-04 | `CalendarEventListView` component in `TaskList.tsx` | M | [ ] | E-01, F-01, G-01 |
| G-05 | `AppShell.tsx` — render CalendarEventListView for `'calendar'` view | S | [ ] | G-01, G-04 |

### G-01 — 'calendar' in uiStore
```ts
type SelectedView = 'upcoming' | 'all' | 'folder' | 'label' | 'priority' | 'completed' | 'calendar'

// Add to state:
selectedCalendarId: string | null

// Add action:
setCalendarView: (calendarId: string) => void
// → sets selectedView = 'calendar', selectedCalendarId = calendarId
```

### G-02 — Calendars section in Sidebar
- Below Folders section; collapsible (same chevron pattern as other sections)
- **Only shown when** `calendarEnabled && enabledCalendars.length > 0` (spec §8.12)
- Each entry: `CalendarDays` icon tinted `cal.color` (icon IS the indicator, not a dot) + `cal.summary`
- Click → `setCalendarView(cal.id)`; highlight active item when `selectedCalendarId === cal.id`
- No "+" button — managed in Settings

### G-03 — Header title
`src/components/layout/Header.tsx`:
```ts
selectedView === 'calendar'
  ? (calendarStore.calendars.find(c => c.id === selectedCalendarId)?.summary ?? 'Calendar')
  : ...existing chain...
```

### G-04 — CalendarEventListView
Add to `src/components/tasks/TaskList.tsx`:
- Uses `useCalendarEvents(selectedCalendarId!)` (from F-01)
- **Overdue group** at top: events where `startDate < today`, secondary sort by `startDate` ascending
- **Remaining groups**: grouped by `startDate`, day header format `"16 Apr · Thursday · Today"` (same as UpcomingView)
- `<CalendarEventItem showDate={false} ...>` for each event
- Empty state when no events for this calendar
- "Enable Google Calendar in Settings" link when `calendarEnabled === false`

### G-05 — Wire into AppShell
`src/components/layout/AppShell.tsx`:
```tsx
<main>
  {settingsOpen
    ? <SettingsPage />
    : selectedView === 'calendar'
      ? <TaskList view="calendar" />  // or render CalendarEventListView directly
      : <TaskList />}
</main>
```
Sidebar stays visible (unlike settings).

---

## Group H — Event Create / Edit in TaskCreateModal

| ID | Title | Effort | Status | Deps |
|----|-------|--------|--------|------|
| H-01 | `calendarDateTime.ts` — `buildEventDateTime`, `buildEndDateTime`, `parseEventDateTimeFromDto` | S | [ ] | — |
| H-02 | `rrule.ts` — `buildRRule`, `parseRRule`, `monthlyOptions` | S | [ ] | — |
| H-03 | Task/Event mode toggle + EVENT mode fields in `TaskCreateModal` | L | [ ] | B-03, B-05, B-06, H-01, H-02 |
| H-04 | `submitEvent` + edit recurring dialog + edit-event mode | M | [ ] | H-01, H-02, H-03, B-03, B-05 |

### H-01 — calendarDateTime utils
**Create** `src/utils/calendarDateTime.ts`:
```ts
// RFC3339 with timezone offset (spec §7.2 buildEventDateTime)
function buildEventDateTime(date: string, time: string): EventDateTime
// Returns { date } for all-day, { dateTime, timeZone } for timed

function buildEndDateTime(startDate: string, startTime: string, endTime: string): EventDateTime
// All-day → { date: startDate + 1 day }
// Timed + no endTime → startTime + 1h
// endTime ≤ startTime → startTime + 1h (clamp)
// else → endTime as-is

function parseEventDateTimeFromDto(dto: CalendarEventDto): { startDate, startTime, endDate, endTime, isAllDay }
```

### H-02 — rrule utils
**Create** `src/utils/rrule.ts`:
```ts
// Builds RRULE strings (spec §17 RRULE Builder)
function buildRRule(options: {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  byDay?: string[]        // e.g. ['MO', 'WE', 'FR'] for WEEKLY
  monthlyOption?: MonthlyOption  // e.g. "2TU" or "-1SA"
  ends: 'NEVER' | 'ON_DATE' | 'AFTER_COUNT'
  endDate?: string        // "YYYY-MM-DD"
  afterCount?: number
}): string

function parseRRule(rruleStr: string): ParsedRRule

// Returns 2-3 options for MONTHLY recurrence based on the date
function monthlyOptions(dateStr: string): MonthlyOption[]
// Option 1: "Monthly on day N"
// Option 2: "Monthly on the Nth Weekday"
// Option 3: "Monthly on the last Weekday" (only when dayOfMonth > 21 and fits)
```

Ordinal computation: `Math.ceil(dayOfMonth / 7)` for 1st–4th; `-1` for last.

### H-03 — Task/Event mode toggle + EVENT fields
`src/components/tasks/TaskCreateModal.tsx` — major additions:

**Mode toggle** (shown ONLY when `!isEditing && !isEditingEvent`):
```tsx
<div className="flex rounded-lg border overflow-hidden">
  <button className={cn('flex-1 py-1.5 text-sm', formMode==='task' && 'bg-muted')}
    onClick={() => setFormMode('task')}>Task</button>
  <button className={cn('flex-1 py-1.5 text-sm', formMode==='event' && 'bg-muted')}
    onClick={() => { setFormMode('event'); loadCalendars() }}>Event</button>
</div>
```

**EVENT mode deadline section** (spec §10.5):
```
[Date chip*]  [Start time chip]  —  [End time chip]
```
- Date chip: "Date *" (gray) when blank; formatted date in deadline color when set; error color when `startDateError`
- Start time chip: "HH:MM" always visible in EVENT mode
- "—" separator always visible
- End time chip: "HH:MM" blank or time value; opens `EndTimePicker` dialog

**EVENT recurrence extras** (spec §10.7, shown when `formMode === 'event' && isRecurring`):
- WEEKLY: 7 circular day-of-week toggle buttons (Mon–Sun); auto-seed from `deadlineDate`'s weekday when WEEKLY first selected
- MONTHLY: `<Select>` with `monthlyOptions(deadlineDate)` (2-3 options)
- Ends section: 3 radio buttons — "Never" / "On [date]" / "After [N] occurrences"

**EVENT mode fields** (Calendar picker):
- `<Select>` or `<DropdownMenu>` from `calendarStore.calendars` filtered by `enabledCalendarIds`
- Loading indicator while `calendarsLoading`
- Error message "No calendars selected. Go to Settings → Calendars." when list empty

**Repeat Row** (spec §10.6): shown when `deadlineDate.isNotBlank() || formMode === 'event'`

### H-04 — submitEvent + edit mode
`src/components/tasks/TaskCreateModal.tsx`:

**`submitEvent()`** (spec §10.13):
```
validate: title (TASK) / date / calendar
if isRecurring → buildRRule(...)
if isEditingEvent && recurring → show "Edit this event / Edit all" dialog
else → calendarApi.createEvent/updateEvent → calendarStore.upsertEvent
if recurring create → re-pull calendar to fetch all generated instances
```

**Edit recurring event dialog** (spec §10.11):
```
"Edit this event only"    → updateEvent(event.id, ..., rrule=null)
"Edit all events in series" → updateEvent(event.recurringEventId, ..., rrule)
"Cancel"
```

**`editingEvent?: CalendarEvent` prop**:
- When set: switch to EVENT mode; pre-fill title, startDate, startTime, endTime, calendarId
- If `isRecurring`: call `calendarApi.getEvent(calendarId, recurringEventId)` → parse `recurrence[0]` RRULE → set recurrence UI state

---

## Summary

| Group | # Tasks | Total effort |
|-------|---------|-------------|
| A — Form UI fixes | 5 | 2M + 3S |
| B — Calendar foundation | 6 | 2M + 4S |
| C — Sync | 2 | 1M + 1S |
| D — Settings | 1 | 1M |
| E — CalendarEventItem | 1 | 1M |
| F — Views integration | 4 | 2M + 2S |
| G — Calendar event list view | 5 | 1M + 4S |
| H — Event create/edit | 4 | 1L + 1M + 2S |
| **Total** | **28** | **1L + 11M + 16S** |

---

## Suggested implementation order

```
Independent starters (no deps):
  A-01, A-02, A-03, B-01, B-02, B-06, G-01, H-01, H-02

After A-01:
  A-04, A-05

After B-01:
  B-03 (needs B-02), B-04 → B-05

After B-05 + B-06:
  C-01 → C-02
  D-01 (needs C-01)
  E-01
  F-01 → F-02 → F-03, F-04
  G-02 (needs G-01)

After G-01 + E-01 + F-01:
  G-04 → G-05

After H-01 + H-02 + B-03 + B-05 + B-06:
  H-03 → H-04
```
