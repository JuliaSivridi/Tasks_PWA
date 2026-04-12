import { useAuthStore } from '@/store/authStore'

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'
const SPREADSHEET_TITLE = 'db_tasks'

/**
 * Ensures a spreadsheet named "db_tasks" exists in the user's Google Drive.
 * Priority: authStore.spreadsheetId (localStorage) > Drive search > create new.
 * The found/created spreadsheet ID is saved to authStore (persisted in localStorage).
 */
export async function ensureSpreadsheet(): Promise<void> {
  const { spreadsheetId, setSpreadsheetId, accessToken } = useAuthStore.getState()

  // Already have an ID stored locally
  if (spreadsheetId) return

  if (!accessToken) throw new Error('Cannot find/create spreadsheet: not authenticated')

  // Search for existing spreadsheet by name in Google Drive
  const query = encodeURIComponent(
    `name='${SPREADSHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
  )
  const listRes = await fetch(`${DRIVE_BASE}/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({})) as Record<string, unknown>
    throw new Error(`Failed to search Drive: ${JSON.stringify(err)}`)
  }

  const list = await listRes.json() as { files: { id: string; name: string }[] }
  if (list.files.length > 0) {
    setSpreadsheetId(list.files[0].id)
    return
  }

  // Not found — create a new spreadsheet
  const res = await fetch(SHEETS_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: SPREADSHEET_TITLE },
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
