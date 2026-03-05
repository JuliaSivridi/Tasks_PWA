import { useAuthStore } from '@/store/authStore'

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

/**
 * Ensures a spreadsheet exists.
 * Priority: authStore.spreadsheetId > VITE_SPREADSHEET_ID env var > create new.
 * The created spreadsheet ID is saved to authStore (persisted in localStorage).
 */
export async function ensureSpreadsheet(): Promise<void> {
  const { spreadsheetId, setSpreadsheetId, accessToken } = useAuthStore.getState()

  // Already have an ID stored locally
  if (spreadsheetId) return

  // Fall back to env var (for users who prefer manual setup)
  const envId = import.meta.env.VITE_SPREADSHEET_ID as string
  if (envId) {
    setSpreadsheetId(envId)
    return
  }

  // No ID anywhere — create a new spreadsheet
  if (!accessToken) throw new Error('Cannot create spreadsheet: not authenticated')

  const res = await fetch(SHEETS_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: 'Task Manager' },
      sheets: [
        { properties: { title: 'tasks' } },
        { properties: { title: 'folders' } },
        { properties: { title: 'labels' } },
        { properties: { title: 'settings' } },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>
    throw new Error(`Failed to create spreadsheet: ${JSON.stringify(err)}`)
  }

  const data = await res.json() as { spreadsheetId: string }
  setSpreadsheetId(data.spreadsheetId)
}
