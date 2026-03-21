import { useAuthStore } from '@/store/authStore'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

// Row-index cache: entityId → 1-based row number (including header)
const rowCache = new Map<string, number>()

export function invalidateRowCache(): void {
  rowCache.clear()
}

async function getToken(): Promise<string> {
  const { accessToken, tokenExpiry, refreshToken } = useAuthStore.getState()
  if (!accessToken) throw new Error('Not authenticated')

  // Refresh if token expires within 60 seconds
  if (tokenExpiry && Date.now() > tokenExpiry - 60_000) {
    await refreshToken()
    const fresh = useAuthStore.getState().accessToken
    if (!fresh) throw new Error('Token refresh failed')
    return fresh
  }

  return accessToken
}

export async function sheetsRequest<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken()
  const spreadsheetId = useAuthStore.getState().spreadsheetId

  const url = `${BASE}/${spreadsheetId}/${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Sheets API ${res.status}: ${JSON.stringify(err)}`)
  }

  return res.json() as Promise<T>
}

// ─── Row index lookup ─────────────────────────────────────────────────────────

export async function findRowIndex(
  sheet: string,
  entityId: string,
): Promise<number | null> {
  if (rowCache.has(entityId)) return rowCache.get(entityId)!

  const data = await sheetsRequest<{ values?: string[][] }>(
    'GET',
    `values/${sheet}!A:A`,
  )

  const rows = data.values ?? []
  for (let i = 1; i < rows.length; i++) {
    const id = rows[i][0]
    if (id) rowCache.set(id, i + 1) // 1-based sheet row
  }

  return rowCache.get(entityId) ?? null
}
