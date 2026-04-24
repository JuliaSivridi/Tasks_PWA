import { sheetsRequest, findRowIndex } from './sheetsClient'
import { SHEET_LABELS, LABEL_RANGE } from '@/utils/constants'
import { labelToRow, parseLabelRows } from '@/utils/sheetsMapper'
import type { Label } from '@/types/label'
import type { SheetsGetResponse } from '@/types/sheets'

const HEADER = ['id', 'name', 'color', 'sort_order']

export async function fetchAllLabels(): Promise<Label[]> {
  const data = await sheetsRequest<SheetsGetResponse>('GET', `values/${LABEL_RANGE}`)
  if (!data.values || data.values.length === 0) return []
  return parseLabelRows(data.values)
}

export async function appendLabel(label: Label): Promise<void> {
  await sheetsRequest('POST', `values/${LABEL_RANGE}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    values: [labelToRow(label)],
  })
}

export async function updateLabel(label: Label): Promise<void> {
  const rowNum = await findRowIndex(SHEET_LABELS, label.id)
  if (!rowNum) { await appendLabel(label); return }
  const range = `${SHEET_LABELS}!A${rowNum}:D${rowNum}`
  await sheetsRequest('PUT', `values/${range}?valueInputOption=RAW`, {
    range, majorDimension: 'ROWS', values: [labelToRow(label)],
  })
}

export async function ensureLabelHeader(): Promise<void> {
  const data = await sheetsRequest<SheetsGetResponse>('GET', `values/${SHEET_LABELS}!A1:D1`)
  if (!data.values || data.values.length === 0) {
    await sheetsRequest('PUT', `values/${SHEET_LABELS}!A1:D1?valueInputOption=RAW`, {
      range: `${SHEET_LABELS}!A1:D1`, majorDimension: 'ROWS', values: [HEADER],
    })
  }
}
