import type { FolderNode } from '../electron'

interface SidebarProps {
  folders: FolderNode[]
  favorites: string[]
  selectedPath: string | null
  onSelectFolder: (path: string) => void
  onSelectFavorites: () => void
}

function FolderTreeItem({
  node,
  selectedPath,
  onSelect,
  depth = 0
}: {
  node: FolderNode
  selectedPath: string | null
  onSelect: (path: string) => void
  depth?: number
}) {
  if (node.type !== 'folder') return null

  const isSelected = selectedPath === node.path
  const hasChildren = node.children && node.children.some(c => c.type === 'folder')

  return (
    <div>
      <div
        className={`folder-item ${isSelected ? 'selected' : ''} ${!node.exists ? 'missing' : ''}`}
        onClick={() => onSelect(node.path)}
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        <span className="folder-item-icon">{node.exists ? '📁' : '⚠️'}</span>
        <span className="folder-item-name">{node.name}</span>
      </div>
      {hasChildren && node.children!
        .filter(c => c.type === 'folder')
        .map(child => (
          <FolderTreeItem
            key={child.path}
            node={child}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))
      }
    </div>
  )
}

export default function Sidebar({ folders, favorites, selectedPath, onSelectFolder, onSelectFavorites }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div
          className={`folder-item ${selectedPath === '__favorites__' ? 'selected' : ''}`}
          onClick={onSelectFavorites}
        >
          <span className="folder-item-icon">⭐</span>
          <span className="folder-item-name">Favorites ({favorites.length})</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Reference Folders</div>
        {folders.length === 0 ? (
          <p style={{ fontSize: 12, color: '#666', padding: '8px 12px' }}>
            No folders added yet
          </p>
        ) : (
          folders.map(folder => (
            <FolderTreeItem
              key={folder.path}
              node={folder}
              selectedPath={selectedPath}
              onSelect={onSelectFolder}
            />
          ))
        )}
      </div>
    </div>
  )
}
