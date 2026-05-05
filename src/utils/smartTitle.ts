import type { Folder } from '@/types/folder'
import type { Label } from '@/types/label'
import type { Priority } from '@/types/task'

export interface ParsedTitle {
  title: string
  folderId: string
  labelsStr: string
  priority: Priority
}

/**
 * Parses smart-title tokens from a raw title string:
 *   @FolderName   — sets folderId (case-insensitive match, first match wins)
 *   #LabelName    — adds to labelIds (case-insensitive match)
 *   !1 / !2 / !3  — sets priority: urgent / important / normal
 *
 * Unmatched tokens are left in the title; extra whitespace is collapsed.
 */
export function parseSmartTitle(
  raw: string,
  folders: Folder[],
  labels: Label[],
  currentFolderId: string,
  currentLabelIds: string[],
  currentPriority: Priority,
): ParsedTitle {
  let title = raw
  let folderId = currentFolderId
  const labelIds = new Set(currentLabelIds)
  let priority = currentPriority

  // @FolderName → sets folderId
  title = title.replace(/@(\S+)/g, (match, name: string) => {
    const found = folders.find(f => f.name.toLowerCase() === name.toLowerCase())
    if (found) { folderId = found.id; return '' }
    return match
  })

  // #LabelName → adds to labelIds
  title = title.replace(/#(\S+)/g, (match, name: string) => {
    const found = labels.find(l => l.name.toLowerCase() === name.toLowerCase())
    if (found) { labelIds.add(found.id); return '' }
    return match
  })

  // !1 → urgent, !2 → important, !3 → normal
  title = title.replace(/!([123])/g, (_match, digit: string) => {
    switch (digit) {
      case '1': priority = 'urgent'; break
      case '2': priority = 'important'; break
      case '3': priority = 'normal'; break
    }
    return ''
  })

  return {
    title: title.replace(/\s{2,}/g, ' ').trim(),
    folderId,
    labelsStr: Array.from(labelIds).join(','),
    priority,
  }
}
