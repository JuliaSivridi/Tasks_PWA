import { sheetsRequest } from './sheetsClient'

interface SheetsValueResponse {
  values?: string[][]
}

export async function loadSettings(): Promise<Record<string, unknown>> {
  try {
    const data = await sheetsRequest<SheetsValueResponse>('GET', 'values/settings!A1')
    const raw = data.values?.[0]?.[0]
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export async function saveSettings(prefs: Record<string, unknown>): Promise<void> {
  const body = {
    range: 'settings!A1',
    majorDimension: 'ROWS',
    values: [[JSON.stringify(prefs)]],
  }
  try {
    await sheetsRequest('PUT', 'values/settings!A1?valueInputOption=RAW', body)
  } catch {
    // Sheet may not exist yet — create it and retry
    try {
      await sheetsRequest('POST', ':batchUpdate', {
        requests: [{ addSheet: { properties: { title: 'settings' } } }],
      })
      await sheetsRequest('PUT', 'values/settings!A1?valueInputOption=RAW', body)
    } catch {
      // Preferences are non-critical — fail silently
    }
  }
}
