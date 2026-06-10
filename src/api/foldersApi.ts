import { sheetsRequest, findRowIndex } from './sheetsClient'
import { SHEET_FOLDERS, FOLDER_RANGE } from '@/utils/constants'
import { folderToRow, parseFolderRows } from '@/utils/sheetsMapper'
import type { Folder } from '@/types/folder'
import type { SheetsGetResponse } from '@/types/sheets'

const HEADER = ['id', 'name', 'color', 'sort_order']

export async function fetchAllFolders(): Promise<Folder[]> {
  const data = await sheetsRequest<SheetsGetResponse>('GET', `values/${FOLDER_RANGE}`)
  if (!data.values || data.values.length === 0) return []
  return parseFolderRows(data.values)
}

export async function appendFolder(folder: Folder): Promise<void> {
  await sheetsRequest('POST', `values/${FOLDER_RANGE}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    values: [folderToRow(folder)],
  })
}

export async function updateFolder(folder: Folder): Promise<void> {
  const rowNum = await findRowIndex(SHEET_FOLDERS, folder.id)
  if (!rowNum) { await appendFolder(folder); return }
  const range = `${SHEET_FOLDERS}!A${rowNum}:D${rowNum}`
  await sheetsRequest('PUT', `values/${range}?valueInputOption=RAW`, {
    range, majorDimension: 'ROWS', values: [folderToRow(folder)],
  })
}

/** Clears the folder's row (same delete mechanism as the Android client).
    The emptied row disappears from parsing; clients prune it locally on pull. */
export async function clearFolderRow(folderId: string): Promise<void> {
  const rowNum = await findRowIndex(SHEET_FOLDERS, folderId)
  if (!rowNum) return
  await sheetsRequest('POST', `values/${SHEET_FOLDERS}!A${rowNum}:D${rowNum}:clear`, {})
}

export async function ensureFolderHeader(): Promise<void> {
  const data = await sheetsRequest<SheetsGetResponse>('GET', `values/${SHEET_FOLDERS}!A1:D1`)
  if (!data.values || data.values.length === 0) {
    await sheetsRequest('PUT', `values/${SHEET_FOLDERS}!A1:D1?valueInputOption=RAW`, {
      range: `${SHEET_FOLDERS}!A1:D1`, majorDimension: 'ROWS', values: [HEADER],
    })
  }
}
