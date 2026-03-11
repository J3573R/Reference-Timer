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

  const handleRowClick = useCallback(async () => {
    onSelect(node.path)

    if (!hasKnownChildren && !hasLoadedChildren) {
      // First click on unloaded folder: select + load + expand
      setIsLoading(true)
      try {
        const subfolders = await window.electronAPI.fs.getSubfolders(node.path)
        setChildren(subfolders)
        setHasLoadedChildren(true)
        if (subfolders.length > 0) {
          setIsExpanded(true)
        }
      } catch (err) {
        console.error('Error loading subfolders:', err)
      }
      setIsLoading(false)
    } else if (isSelected && hasKnownChildren) {
      // Already selected: toggle expand/collapse
      setIsExpanded(prev => !prev)
    } else if (!isSelected && hasKnownChildren && !isExpanded) {
      // Not selected, has children, not expanded: expand
      setIsExpanded(true)
    }
    // Not selected but already expanded: just select, keep expanded
  }, [onSelect, node.path, hasKnownChildren, hasLoadedChildren, isSelected, isExpanded])

  const renderChevron = () => {
    if (!node.exists) return <span style={{ width: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, opacity: 0.5 }}>!</span>
    if (isLoading) return <span style={{ width: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, opacity: 0.4 }}>...</span>
    if (hasKnownChildren) {
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className={`folder-chevron ${isExpanded ? 'expanded' : ''}`}
        >
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    }
    return <span style={{ width: 14 }}></span>
  }

  return (
    <div>
      <div
        className={`folder-item ${isSelected ? 'selected' : ''} ${!node.exists ? 'missing' : ''}`}
        onClick={handleRowClick}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {renderChevron()}
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          style={{ opacity: 0.85, flexShrink: 0 }}
        >
          {isExpanded ? (
            <path d="M1.5 3.5h13c.28 0 .5.22.5.5v8c0 .28-.22.5-.5.5h-13c-.28 0-.5-.22-.5-.5V4c0-.28.22-.5.5-.5z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          ) : (
            <path d="M1.5 3.5h5l1 1.5h6.5c.28 0 .5.22.5.5v6.5c0 .28-.22.5-.5.5h-12c-.28 0-.5-.22-.5-.5v-8c0-.28.22-.5.5-.5z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          )}
        </svg>
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
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            style={{ opacity: 0.6, flexShrink: 0 }}
          >
            <path d="M8 1.5l2 4 4.5.5-3.25 3 .75 4.5L8 11.5l-4 2 .75-4.5L1.5 6l4.5-.5 2-4z" stroke="currentColor" strokeWidth="1.2" fill={selectedPath === '__favorites__' ? 'currentColor' : 'none'}/>
          </svg>
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
