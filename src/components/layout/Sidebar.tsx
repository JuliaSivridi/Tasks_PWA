import { useState, useEffect } from 'react'
import { CalendarClock, CheckCircle2, LayoutList, Inbox, Plus, MoreHorizontal, Pencil, Trash2, Folder, RefreshCw, Tag } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useTasksStore } from '@/store/tasksStore'
import { useLabelsStore } from '@/store/labelsStore'
import { useSyncStore } from '@/store/syncStore'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { INBOX_FOLDER_ID, LABEL_COLOR_PRESETS } from '@/utils/constants'
import { format } from 'date-fns'
import { fullSync } from '@/services/syncService'

// ─── Generic form modal (used by both Folder and Label) ───────────────────────

function ItemFormModal({
  open, title, initialName = '', initialColor = LABEL_COLOR_PRESETS[1],
  onSave, onCancel,
}: {
  open: boolean
  title: string
  initialName?: string
  initialColor?: string
  onSave: (name: string, color: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)

  useEffect(() => {
    if (open) { setName(initialName); setColor(initialColor) }
  }, [open, initialName, initialColor])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <Input
            autoFocus
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onSave(name.trim(), color)
            }}
          />
          <div className="flex gap-2 flex-wrap">
            {LABEL_COLOR_PRESETS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full border-2 transition-all"
                style={{ backgroundColor: c, borderColor: c === color ? 'white' : 'transparent' }}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button onClick={() => name.trim() && onSave(name.trim(), color)} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export function Sidebar() {
  const { selectedView, selectedFolderId, selectedLabelId, setView, setCreateTaskOpen, setSidebarOpen } = useUIStore()
  const goTo = (...args: Parameters<typeof setView>) => { setView(...args); setSidebarOpen(false) }
  const { folders, addFolder, updateFolder, deleteFolder } = useFoldersStore()
  const { moveTasksToFolder } = useTasksStore()
  const { labels, addLabel, updateLabel, deleteLabel } = useLabelsStore()
  const { stripLabelFromTasks } = useTasksStore()
  const { lastSyncAt, isSyncing } = useSyncStore()

  // Folder state
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string; color: string } | null>(null)
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)

  // Label state
  const [creatingLabel, setCreatingLabel] = useState(false)
  const [editingLabel, setEditingLabel] = useState<{ id: string; name: string; color: string } | null>(null)
  const [deletingLabelId, setDeletingLabelId] = useState<string | null>(null)

  const sortedFolders = [...folders].sort((a, b) => a.sort_order - b.sort_order)
  const deletingFolder = folders.find(f => f.id === deletingFolderId)
  const deletingLabel = labels.find(l => l.id === deletingLabelId)

  return (
    <div className="flex flex-col h-full select-none">
      {/* Add task button */}
      <div className="px-2 pt-2 pb-2">
        <button
          onClick={() => setCreateTaskOpen(true)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-base font-medium"
        >
          <Plus size={16} />
          Add task
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">

        {/* ── Navigation ── */}
        <div className="space-y-0.5">
          {([
            { view: 'upcoming' as const, label: 'Upcoming', icon: <CalendarClock size={16} /> },
            { view: 'all' as const, label: 'All tasks', icon: <LayoutList size={16} /> },
            { view: 'completed' as const, label: 'Completed', icon: <CheckCircle2 size={16} /> },
          ]).map(({ view, label, icon }) => (
            <button
              key={view}
              onClick={() => goTo(view)}
              className={cn(
                'flex items-center gap-2 w-full px-2 py-2 rounded-md text-base transition-colors hover:bg-accent',
                selectedView === view && 'bg-accent font-medium text-primary',
              )}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ── Folders ── */}
        <div className="border-t pt-2 space-y-0.5">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-sm font-semibold text-muted-foreground">Folders</span>
            <button
              onClick={() => setCreatingFolder(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="New folder"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Inbox first, always */}
          {(() => {
            const inbox = folders.find(f => f.id === INBOX_FOLDER_ID)
            if (!inbox) return null
            return (
              <div
                onClick={() => goTo('folder', INBOX_FOLDER_ID)}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-2 rounded-md text-base cursor-pointer transition-colors hover:bg-accent',
                  selectedView === 'folder' && selectedFolderId === INBOX_FOLDER_ID && 'bg-accent font-medium text-primary',
                )}
              >
                <Inbox size={16} className="flex-shrink-0 text-primary" />
                <span className="flex-1 truncate">Inbox</span>
              </div>
            )
          })()}

          {sortedFolders.filter(f => f.id !== INBOX_FOLDER_ID).map(folder => (
            <div
              key={folder.id}
              onClick={() => goTo('folder', folder.id)}
              className={cn(
                'group flex items-center gap-1.5 px-2 py-2 rounded-md text-base cursor-pointer transition-colors hover:bg-accent',
                selectedView === 'folder' && selectedFolderId === folder.id && 'bg-accent font-medium text-primary',
              )}
            >
              <Folder size={16} className="flex-shrink-0" style={{ color: folder.color }} />
              <span className="flex-1 truncate">{folder.name}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation()
                    setEditingFolder({ id: folder.id, name: folder.name, color: folder.color })
                  }}>
                    <Pencil size={14} className="mr-2" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeletingFolderId(folder.id) }}
                  >
                    <Trash2 size={14} className="mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>

        {/* ── Labels ── */}
        <div className="border-t pt-2 space-y-0.5">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-sm font-semibold text-muted-foreground">Labels</span>
            <button
              onClick={() => setCreatingLabel(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="New label"
            >
              <Plus size={16} />
            </button>
          </div>

          {labels.map(label => (
            <div
              key={label.id}
              onClick={() => goTo('label', label.id)}
              className={cn(
                'group flex items-center gap-1.5 px-2 py-2 rounded-md text-base cursor-pointer transition-colors hover:bg-accent',
                selectedView === 'label' && selectedLabelId === label.id && 'bg-accent font-medium text-primary',
              )}
            >
              <Tag size={16} className="flex-shrink-0" style={{ color: label.color }} />
              <span className="flex-1 truncate">{label.name}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation()
                    setEditingLabel({ id: label.id, name: label.name, color: label.color })
                  }}>
                    <Pencil size={14} className="mr-2" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeletingLabelId(label.id) }}
                  >
                    <Trash2 size={14} className="mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>

      </div>

      {/* Footer: sync status + button */}
      <div className="px-3 py-2 border-t flex items-center gap-2">
        <button
          onClick={() => void fullSync()}
          disabled={isSyncing}
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          title="Sync"
        >
          <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
        </button>
        <span className="text-sm text-muted-foreground">
          {isSyncing ? 'Syncing...' : lastSyncAt ? `Synced ${format(new Date(lastSyncAt), 'HH:mm')}` : 'Not synced'}
        </span>
      </div>

      {/* Create folder modal */}
      <ItemFormModal
        open={creatingFolder}
        title="New folder"
        onSave={async (name, color) => {
          await addFolder({ name, color, sort_order: folders.length })
          setCreatingFolder(false)
        }}
        onCancel={() => setCreatingFolder(false)}
      />

      {/* Edit folder modal */}
      <ItemFormModal
        open={editingFolder !== null}
        title="Edit folder"
        initialName={editingFolder?.name}
        initialColor={editingFolder?.color}
        onSave={async (name, color) => {
          if (editingFolder) await updateFolder(editingFolder.id, { name, color })
          setEditingFolder(null)
        }}
        onCancel={() => setEditingFolder(null)}
      />

      {/* Create label modal */}
      <ItemFormModal
        open={creatingLabel}
        title="New label"
        onSave={async (name, color) => {
          await addLabel({ name, color })
          setCreatingLabel(false)
        }}
        onCancel={() => setCreatingLabel(false)}
      />

      {/* Edit label modal */}
      <ItemFormModal
        open={editingLabel !== null}
        title="Edit label"
        initialName={editingLabel?.name}
        initialColor={editingLabel?.color}
        onSave={async (name, color) => {
          if (editingLabel) await updateLabel(editingLabel.id, { name, color })
          setEditingLabel(null)
        }}
        onCancel={() => setEditingLabel(null)}
      />

      <ConfirmDialog
        open={deletingFolderId !== null}
        title={`Delete folder "${deletingFolder?.name}"?`}
        description="Tasks will be moved to Inbox."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deletingFolderId) {
            await moveTasksToFolder(deletingFolderId, INBOX_FOLDER_ID)
            await deleteFolder(deletingFolderId)
          }
          setDeletingFolderId(null)
        }}
        onCancel={() => setDeletingFolderId(null)}
      />

      <ConfirmDialog
        open={deletingLabelId !== null}
        title={`Delete label "${deletingLabel?.name}"?`}
        description="Label will be removed from all tasks."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deletingLabelId) {
            await stripLabelFromTasks(deletingLabelId)
            await deleteLabel(deletingLabelId)
          }
          setDeletingLabelId(null)
        }}
        onCancel={() => setDeletingLabelId(null)}
      />
    </div>
  )
}
