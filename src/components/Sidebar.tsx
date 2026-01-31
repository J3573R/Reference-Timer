import { useState, useCallback, useEffect } from 'react'
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
  depth = 0,
  defaultExpanded = false
}: {
  node: FolderNode
  selectedPath: string | null
  onSelect: (path: string) => void
  depth?: number
  defaultExpanded?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [children, setChildren] = useState<FolderNode[]>(node.children || [])
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoadedChildren, setHasLoadedChildren] = useState(false)

  if (node.type !== 'folder') return null

  const isSelected = selectedPath === node.path
  const hasKnownChildren = children.length > 0

  // Load subfolders on mount to know if we should show expand arrow
  // Also auto-expand if defaultExpanded is true
  useEffect(() => {
    if (!hasLoadedChildren) {
      setIsLoading(true)
      window.electronAPI.fs.getSubfolders(node.path)
        .then(subfolders => {
          setChildren(subfolders)
          setHasLoadedChildren(true)
          // Only auto-expand if defaultExpanded and there are children
          if (defaultExpanded && subfolders.length > 0) {
            setIsExpanded(true)
          }
        })
        .catch(err => console.error('Error loading subfolders:', err))
        .finally(() => setIsLoading(false))
    }
  }, [defaultExpanded, hasLoadedChildren, node.path])

  const handleToggleExpand = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!hasLoadedChildren) {
      // Lazy load subfolders
      setIsLoading(true)
      try {
        const subfolders = await window.electronAPI.fs.getSubfolders(node.path)
        setChildren(subfolders)
        setHasLoadedChildren(true)
        setIsExpanded(true)
      } catch (err) {
        console.error('Error loading subfolders:', err)
      }
      setIsLoading(false)
    } else {
      setIsExpanded(!isExpanded)
    }
  }, [hasLoadedChildren, isExpanded, node.path])

  const handleSelect = useCallback(() => {
    onSelect(node.path)
  }, [onSelect, node.path])

  // Render expand arrow for folders - only show if we know there are children
  const renderExpandIcon = () => {
    if (!node.exists) return <span style={{ width: 16, textAlign: 'center' }}>⚠️</span>
    if (isLoading) return <span style={{ width: 16, textAlign: 'center' }}>⏳</span>
    if (hasKnownChildren) {
      // Only show arrow if we know there are children
      return (
        <span
          style={{ width: 16, textAlign: 'center', cursor: 'pointer' }}
          onClick={handleToggleExpand}
        >
          {isExpanded ? '▼' : '▶'}
        </span>
      )
    }
    // No children or haven't loaded yet - show empty space for alignment
    return <span style={{ width: 16 }}></span>
  }

  return (
    <div>
      <div
        className={`folder-item ${isSelected ? 'selected' : ''} ${!node.exists ? 'missing' : ''}`}
        onClick={handleSelect}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {renderExpandIcon()}
        <span className="folder-item-icon">
          {isExpanded ? '📂' : '📁'}
        </span>
        <span className="folder-item-name">{node.name}</span>
      </div>
      {isExpanded && children.length > 0 && children.map(child => (
        <FolderTreeItem
          key={child.path}
          node={child}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
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
              defaultExpanded={true}
            />
          ))
        )}
      </div>
    </div>
  )
}
