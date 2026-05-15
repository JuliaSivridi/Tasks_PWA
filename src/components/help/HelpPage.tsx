import { cn } from '@/lib/utils'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.75rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-2 px-1">
      {children}
    </p>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-xl bg-card px-4 py-3.5 flex flex-col gap-2">
      {children}
    </div>
  )
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.92rem] leading-[1.55]">{children}</p>
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, i) => (
        <li key={i} className="text-[0.92rem] leading-[1.55] flex gap-2">
          <span className="text-primary flex-shrink-0">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[0.88rem] text-muted-foreground bg-background rounded-lg px-3 py-2 leading-[1.5]">
      {children}
    </div>
  )
}

type TableRow = [string, string]

function FeatureTable({ rows }: { rows: TableRow[] }) {
  return (
    <table className="w-full border-collapse text-[0.88rem]">
      <thead>
        <tr>
          <th className={cn(
            'text-left text-[0.75rem] uppercase tracking-wider text-muted-foreground',
            'border-b border-border pb-2 pr-4 font-semibold',
          )}>
            Field
          </th>
          <th className={cn(
            'text-left text-[0.75rem] uppercase tracking-wider text-muted-foreground',
            'border-b border-border pb-2 font-semibold',
          )}>
            Description
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, desc]) => (
          <tr key={label} className="border-b border-border last:border-0">
            <td className="py-2 pr-4 align-top whitespace-nowrap w-[1%] font-medium">{label}</td>
            <td className="py-2 align-top text-muted-foreground">{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function HelpPage() {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-lg mx-auto space-y-6">

          <section>
            <SectionLabel>Getting started</SectionLabel>
            <Card>
              <Para>
                Tasks syncs your data with Google Sheets — everything lives in your own Google account, no separate sign-up needed.
              </Para>
              <List items={[
                'Sign in with Google to get started.',
                'A spreadsheet is created automatically in your Google Drive.',
                'All tasks, folders, and labels are saved there in real time.',
              ]} />
              <Note>Your data is yours — you can open and edit the spreadsheet directly in Google Sheets at any time.</Note>
            </Card>
          </section>

          <section>
            <SectionLabel>Tasks</SectionLabel>
            <Card>
              <Para>Create tasks with a title, priority, deadline, folder, and labels. Tasks support unlimited subtask nesting.</Para>
              <FeatureTable rows={[
                ['Title', 'Required. The main description of the task.'],
                ['Priority', 'High, Medium, Low, or None. Affects sort order in All Tasks.'],
                ['Deadline', 'Optional date. Overdue tasks are highlighted in red.'],
                ['Folder', 'Group tasks by project or area of work.'],
                ['Labels', 'Add multiple tags for flexible filtering.'],
                ['Subtasks', 'Tap the expand arrow to add child tasks under any task.'],
              ]} />
            </Card>
          </section>

          <section>
            <SectionLabel>Views</SectionLabel>
            <Card>
              <Para>Navigate between views from the sidebar.</Para>
              <List items={[
                'Upcoming — tasks with upcoming or overdue deadlines, sorted by date.',
                'All Tasks — every active task, sorted by priority.',
                'Calendar — events and tasks on a monthly grid.',
                'Completed — finished tasks, hidden from main views.',
                'Folders — tasks filtered to a single folder.',
                'Labels — tasks filtered by a specific tag.',
              ]} />
            </Card>
          </section>

          <section>
            <SectionLabel>Calendar & events</SectionLabel>
            <Card>
              <Para>Tasks integrates with Google Calendar. Enable calendar sync in Settings to see events alongside your tasks.</Para>
              <List items={[
                'View Google Calendar events in the Calendar view.',
                'Create new events directly from the calendar using the + button.',
                'Tasks with deadlines appear as markers on the calendar grid.',
              ]} />
              <Note>Calendar sync requires the Google Calendar scope. You may be asked to re-authorise when enabling it for the first time.</Note>
            </Card>
          </section>

          <section>
            <SectionLabel>Sync & offline</SectionLabel>
            <Card>
              <Para>Tasks works offline. Changes made without internet are saved locally and synced automatically when you reconnect.</Para>
              <List items={[
                'Sync status is shown at the bottom of the sidebar.',
                'Tap the refresh icon to manually trigger a sync.',
                'Conflicts are resolved automatically — last write wins.',
              ]} />
              <Note>If you edit the same task on two devices simultaneously, the most recent change is kept.</Note>
            </Card>
          </section>

          <section>
            <SectionLabel>Install as app</SectionLabel>
            <Card>
              <Para>Tasks is a Progressive Web App (PWA) — install it on your device for a native app experience with offline support.</Para>
              <List items={[
                'Android: tap "Add to Home Screen" in Chrome.',
                'iOS: tap Share → "Add to Home Screen" in Safari.',
                'Desktop: click the install icon in your browser\'s address bar.',
              ]} />
            </Card>
          </section>

        </div>
      </div>
    </div>
  )
}
