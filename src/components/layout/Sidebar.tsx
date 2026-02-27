import { useState } from 'react'
import { CalendarClock, CheckCircle2, Inbox, Plus, MoreHorizontal, Pencil, Trash2, Tag, Folder, RefreshCw, Flag } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useLabelsStore } from '@/store/labelsStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useTasksStore } from '@/store/tasksStore'
import { useSyncStore } from '@/store/syncStore'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { LABEL_COLOR_PRESETS, INBOX_FOLDER_ID } from '@/utils/constants'
import { format } from 'date-fns'
import { fullSync } from '@/services/syncService'

// ─── Inline create form ───────────────────────────────────────────────────────

function InlineCreate({
  placeholder,
  onSave,
  onCancel,
  colorPicker,
  color,
  onColorChange,
}: {
  placeholder: string
  onSave: (name: string) => void
  onCancel: () => void
  colorPicker?: boolean
  color?: string
  onColorChange?: (c: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <div className="px-2 pb-1 space-y-1.5">
      {colorPicker && onColorChange && (
        <div className="flex gap-1 flex-wrap pt-1">
          {LABEL_COLOR_PRESETS.map(c => (
            <button
              key={c}
              onClick={() => onColorChange(c)}
              className="w-4 h-4 rounded-full border-2 transition-all"
              style={{ backgroundColor: c, borderColor: c === color ? '#1e293b' : 'transparent' }}
            />
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <Input
          autoFocus
          className="h-7 text-xs"
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onSave(name.trim())
            if (e.key === 'Escape') onCancel()
          }}
        />
        <button
          onClick={() => name.trim() && onSave(name.trim())}
          className="text-sm px-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
        >
          OK
        </button>
      </div>
    </div>
  )
}

// ─── Inline rename form ───────────────────────────────────────────────────────

function InlineRename({
  initialName,
  onSave,
  onCancel,
}: {
  initialName: string
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  return (
    <div className="flex gap-1 px-2 py-0.5">
      <Input
        autoFocus
        className="h-7 text-xs"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSave(name.trim())
          if (e.key === 'Escape') onCancel()
        }}
      />
      <button
        onClick={() => name.trim() && onSave(name.trim())}
        className="text-sm px-2 rounded bg-primary text-primary-foreground hover:bg-primary/90"
      >
        OK
      </button>
    </div>
  )
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export function Sidebar() {
  const { selectedView, selectedFolderId, selectedLabelId, selectedPriorityId, setView, setCreateTaskOpen, setSidebarOpen } = useUIStore()
  const goTo = (...args: Parameters<typeof setView>) => { setView(...args); setSidebarOpen(false) }
  const { folders, addFolder, updateFolder, deleteFolder } = useFoldersStore()
  const { labels, addLabel, renameLabel, deleteLabel } = useLabelsStore()
  const { moveTasksToFolder, stripLabelFromTasks } = useTasksStore()
  const { lastSyncAt, isSyncing } = useSyncStore()

  const [creatingFolder, setCreatingFolder] = useState(false)
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)

  const [creatingLabel, setCreatingLabel] = useState(false)
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLOR_PRESETS[5])
  const [renamingLabelId, setRenamingLabelId] = useState<string | null>(null)
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

        {/* ── Priority ── */}
        <div className="border-t pt-2">
          <span className="text-sm font-semibold text-muted-foreground px-2 mb-1 block">Priority</span>
          <div className="flex gap-1 px-2">
            {([
              { id: 'urgent',    color: '#f87171', title: 'Urgent' },
              { id: 'important', color: '#fb923c', title: 'Important' },
              { id: 'normal',    color: '#9ca3af', title: 'Normal' },
            ] as const).map(p => (
              <button
                key={p.id}
                onClick={() => goTo('priority', p.id)}
                className={cn(
                  'flex-1 flex items-center justify-center py-2 rounded-md transition-colors hover:bg-accent',
                  selectedView === 'priority' && selectedPriorityId === p.id && 'bg-accent',
                )}
                title={p.title}
              >
                <Flag size={16} style={{ color: p.color }} />
              </button>
            ))}
          </div>
        </div>

        {/* ── Folders ── */}
        <div className="border-t pt-2 space-y-0.5">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-sm font-semibold text-muted-foreground">
              Folders
            </span>
            <button
              onClick={() => setCreatingFolder(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="New folder"
            >
              <Plus size={16} />
            </button>
          </div>

          {creatingFolder && (
            <InlineCreate
              placeholder="Folder name"
              onSave={async (name) => {
                await addFolder({ name, color: LABEL_COLOR_PRESETS[1], sort_order: folders.length })
                setCreatingFolder(false)
              }}
              onCancel={() => setCreatingFolder(false)}
            />
          )}

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
            <div key={folder.id}>
              {renamingFolderId === folder.id ? (
                <InlineRename
                  initialName={folder.name}
                  onSave={async (name) => {
                    await updateFolder(folder.id, { name })
                    setRenamingFolderId(null)
                  }}
                  onCancel={() => setRenamingFolderId(null)}
                />
              ) : (
                <div
                  onClick={() => goTo('folder', folder.id)}
                  className={cn(
                    'group flex items-center gap-1.5 px-2 py-2 rounded-md text-base cursor-pointer transition-colors hover:bg-accent',
                    selectedView === 'folder' && selectedFolderId === folder.id && 'bg-accent font-medium text-primary',
                  )}
                >
                  <Folder size={16} className="flex-shrink-0 text-primary" />
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
                      <DropdownMenuItem onClick={() => setRenamingFolderId(folder.id)}>
                        <Pencil size={14} className="mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeletingFolderId(folder.id)}
                      >
                        <Trash2 size={14} className="mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Labels ── */}
        <div className="border-t pt-2 space-y-0.5">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-sm font-semibold text-muted-foreground">
              Labels
            </span>
            <button
              onClick={() => { setCreatingLabel(true); setNewLabelColor(LABEL_COLOR_PRESETS[5]) }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="New label"
            >
              <Plus size={16} />
            </button>
          </div>

          {creatingLabel && (
            <InlineCreate
              placeholder="Label name"
              colorPicker
              color={newLabelColor}
              onColorChange={setNewLabelColor}
              onSave={async (name) => {
                await addLabel({ name, color: newLabelColor })
                setCreatingLabel(false)
              }}
              onCancel={() => setCreatingLabel(false)}
            />
          )}

          {labels.map(label => (
            <div key={label.id}>
              {renamingLabelId === label.id ? (
                <InlineRename
                  initialName={label.name}
                  onSave={async (name) => {
                    await renameLabel(label.id, name)
                    setRenamingLabelId(null)
                  }}
                  onCancel={() => setRenamingLabelId(null)}
                />
              ) : (
                <div
                  onClick={() => goTo('label', label.id)}
                  className={cn(
                    'group flex items-center gap-1.5 px-2 py-2 rounded-md text-base cursor-pointer transition-colors hover:bg-accent',
                    selectedView === 'label' && selectedLabelId === label.id && 'bg-accent font-medium',
                  )}
                >
                  <Tag size={14} className="flex-shrink-0" style={{ color: label.color }} />
                  <span className="flex-1 truncate" style={{ color: label.color }}>{label.name}</span>
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
                      <DropdownMenuItem onClick={() => setRenamingLabelId(label.id)}>
                        <Pencil size={14} className="mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeletingLabelId(label.id)}
                      >
                        <Trash2 size={14} className="mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
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
