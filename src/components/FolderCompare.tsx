import { useState, useEffect, useMemo } from 'react';
import {
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Copy,
  Folder,
  Check,
  FileCode,
  GitCompare,
  ChevronRight,
  ChevronDown,
  Trash2,
  X,
  Equal,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api, FileNode } from '../api';

interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  row: CompareRow;
  side: 'left' | 'right';
  targetPath: string;
}

interface FolderCompareProps {
  onOpenTextCompare: (leftPath: string, rightPath: string) => void;
  updateTitle: (title: string) => void;
  initialLeftPath?: string;
  initialRightPath?: string;
}

interface CompareRow {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  leftExists: boolean;
  rightExists: boolean;
  leftSize: number;
  rightSize: number;
  leftMtime: number;
  rightMtime: number;
  leftFullPath: string;
  rightFullPath: string;
  status: 'identical' | 'different' | 'leftOnly' | 'rightOnly';
  depth: number;
  isHidden: boolean;
}

export default function FolderCompare({
  onOpenTextCompare,
  updateTitle,
  initialLeftPath,
  initialRightPath,
}: FolderCompareProps) {
  const [leftPath, setLeftPath] = useState<string>(() => {
    return initialLeftPath || localStorage.getItem('tinydiff_last_left_folder') || '';
  });
  const [rightPath, setRightPath] = useState<string>(() => {
    return initialRightPath || localStorage.getItem('tinydiff_last_right_folder') || '';
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'diff' | 'same' | 'leftOnly' | 'rightOnly'>('all');
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Copying Progress & Toast State
  const [syncingState, setSyncingState] = useState<{
    relativePath: string;
    name: string;
    direction: 'left-to-right' | 'right-to-left';
  } | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  // Context Menu & Delete Confirm Modal States
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    path: string;
    name: string;
    isDirectory: boolean;
    side: 'left' | 'right';
  } | null>(null);

  // Multi-Select States
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [deleteConfirmTargetBatch, setDeleteConfirmTargetBatch] = useState<{
    path: string;
    name: string;
    isDirectory: boolean;
    side: 'left' | 'right';
  }[] | null>(null);

  // History states for auto-complete datalists
  const [leftHistory, setLeftHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('tinydiff_left_folder_history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [rightHistory, setRightHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('tinydiff_right_folder_history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const saveFolderHistory = (side: 'left' | 'right', pathStr: string) => {
    if (!pathStr) return;
    const historyKey = side === 'left' ? 'tinydiff_left_folder_history' : 'tinydiff_right_folder_history';
    const lastKey = side === 'left' ? 'tinydiff_last_left_folder' : 'tinydiff_last_right_folder';

    localStorage.setItem(lastKey, pathStr);

    try {
      const raw = localStorage.getItem(historyKey);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const updated = [pathStr, ...list.filter((p) => p !== pathStr)].slice(0, 10);
      localStorage.setItem(historyKey, JSON.stringify(updated));
      if (side === 'left') setLeftHistory(updated);
      else setRightHistory(updated);
    } catch {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Column Width States (Default: Size=100px, Modified=200px)
  const [sizeWidth, setSizeWidth] = useState<number>(100);
  const [modifiedWidth, setModifiedWidth] = useState<number>(200);
  const [resizing, setResizing] = useState<'size' | 'modified' | null>(null);

  const startResize = (col: 'size' | 'modified', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(col);

    const startX = e.clientX;
    const startSize = sizeWidth;
    const startModified = modifiedWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      if (col === 'size') {
        const newWidth = Math.max(50, Math.min(300, startSize - deltaX));
        setSizeWidth(newWidth);
      } else if (col === 'modified') {
        const newWidth = Math.max(100, Math.min(450, startModified - deltaX));
        setModifiedWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const gridLayout = `minmax(100px, 1fr) ${sizeWidth}px ${modifiedWidth}px`;

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const isRowVisible = (relativePath: string) => {
    const parts = relativePath.split('/');
    if (parts.length <= 1) return true; // Root level nodes are always visible

    let currentParent = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentParent = currentParent ? `${currentParent}/${parts[i]}` : parts[i];
      if (!expandedPaths.has(currentParent)) {
        return false;
      }
    }
    return true;
  };

  const selectLeftFolder = async () => {
    const startPath = leftPath || localStorage.getItem('tinydiff_last_left_folder') || undefined;
    const path = await api.selectDirectory(startPath);
    if (path) {
      setLeftPath(path);
      saveFolderHistory('left', path);
      const folderName = path.split(/[\\/]/).pop() || 'Folder';
      updateTitle(`FC: ${folderName}`);
    }
  };

  const selectRightFolder = async () => {
    const startPath = rightPath || localStorage.getItem('tinydiff_last_right_folder') || undefined;
    const path = await api.selectDirectory(startPath);
    if (path) {
      setRightPath(path);
      saveFolderHistory('right', path);
      if (leftPath) {
        const folderNameLeft = leftPath.split(/[\\/]/).pop() || 'Folder';
        const folderNameRight = path.split(/[\\/]/).pop() || 'Folder';
        updateTitle(`${folderNameLeft} ↔ ${folderNameRight}`);
      }
    }
  };

  const runCompare = async (keepExpanded = false) => {
    if (!leftPath || !rightPath) {
      setError('Both left and right directory paths must be specified.');
      return;
    }

    saveFolderHistory('left', leftPath);
    saveFolderHistory('right', rightPath);

    setLoading(true);
    setError(null);
    if (!keepExpanded) {
      setExpandedPaths(new Set()); // Collapse all folders by default on fresh initial comparison
    }

    try {
      const leftNodes = await api.scanDirectory(leftPath);
      const rightNodes = await api.scanDirectory(rightPath);

      const leftMap = new Map<string, FileNode>();
      leftNodes.forEach((node) => leftMap.set(node.relativePath, node));

      const rightMap = new Map<string, FileNode>();
      rightNodes.forEach((node) => rightMap.set(node.relativePath, node));

      // Combine all relative paths
      const allPathsSet = new Set<string>([...leftMap.keys(), ...rightMap.keys()]);
      const isDir = (relPath: string): boolean => {
        const node = leftMap.get(relPath) || rightMap.get(relPath);
        return node ? node.isDirectory : false;
      };

      // Directory-first hierarchical sorting
      const sortedPaths = Array.from(allPathsSet).sort((a, b) => {
        const aParts = a.split('/');
        const bParts = b.split('/');
        const minLen = Math.min(aParts.length, bParts.length);
        for (let i = 0; i < minLen; i++) {
          if (aParts[i] !== bParts[i]) {
            const relA = aParts.slice(0, i + 1).join('/');
            const relB = bParts.slice(0, i + 1).join('/');
            const dirA = isDir(relA);
            const dirB = isDir(relB);

            if (dirA !== dirB) {
              return dirA ? -1 : 1;
            }
            return aParts[i].localeCompare(bParts[i]);
          }
        }
        return a.length - b.length;
      });

      const comparedRows: CompareRow[] = sortedPaths.map((relPath) => {
        const leftNode = leftMap.get(relPath);
        const rightNode = rightMap.get(relPath);

        const leftExists = !!leftNode;
        const rightExists = !!rightNode;

        const isDirectory = leftNode?.isDirectory ?? rightNode?.isDirectory ?? false;
        const depth = relPath.split('/').length - 1;

        const leftSize = leftNode?.size ?? 0;
        const rightSize = rightNode?.size ?? 0;
        const leftMtime = leftNode?.mtimeMs ?? 0;
        const rightMtime = rightNode?.mtimeMs ?? 0;

        const leftFullPath = leftNode?.path ?? `${leftPath}/${relPath}`;
        const rightFullPath = rightNode?.path ?? `${rightPath}/${relPath}`;

        let status: CompareRow['status'] = 'identical';

        if (leftExists && !rightExists) {
          status = 'leftOnly';
        } else if (!leftExists && rightExists) {
          status = 'rightOnly';
        } else if (isDirectory) {
          status = 'identical'; // Directories themselves don't differ in content
        } else {
          // Compare files by size and modified timestamp
          const sizeDiff = leftSize !== rightSize;
          // Beyond Compare standard: 2-second (2000ms) tolerance for file modification timestamps
          const timeDiff = Math.abs(leftMtime - rightMtime) > 2000;
          if (sizeDiff || timeDiff) {
            status = 'different';
          }
        }

        const name = relPath.split('/').pop() || '';
        const isHidden = (leftNode?.isHidden ?? false) || (rightNode?.isHidden ?? false);

        return {
          name,
          relativePath: relPath,
          isDirectory,
          leftExists,
          rightExists,
          leftSize,
          rightSize,
          leftMtime,
          rightMtime,
          leftFullPath,
          rightFullPath,
          status,
          depth,
          isHidden,
        };
      });

      setRows(comparedRows);
    } catch (err: any) {
      setError(err?.message || String(err) || 'An error occurred during comparison.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leftPath && rightPath) {
      runCompare();
    }
  }, []);

  const handleSyncFile = async (row: CompareRow, direction: 'left-to-right' | 'right-to-left') => {
    if (syncingState) return;

    try {
      if (row.isDirectory) {
        setError('Synchronizing full directories is not supported. Please sync individual files.');
        return;
      }

      setSyncingState({
        relativePath: row.relativePath,
        name: row.name,
        direction,
      });
      setError(null);
      setSyncSuccessMsg(null);

      const src = direction === 'left-to-right' ? row.leftFullPath : row.rightFullPath;
      const dest = direction === 'left-to-right' ? row.rightFullPath : row.leftFullPath;

      if (direction === 'left-to-right' && !row.leftExists) return;
      if (direction === 'right-to-left' && !row.rightExists) return;

      await api.copyFile(src, dest);

      await runCompare(true);
      setSelectedPaths(new Set());
      setLastSelectedPath(null);

      const dirLabel = direction === 'left-to-right' ? 'left → right' : 'right → left';
      setSyncSuccessMsg(`Copied "${row.name}" (${dirLabel})`);
      setTimeout(() => setSyncSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(`Sync failed: ${err?.message || String(err)}`);
    } finally {
      setSyncingState(null);
    }
  };

  const handleSyncBatch = async (direction: 'left-to-right' | 'right-to-left') => {
    if (syncingState || selectedPaths.size === 0) return;

    const selectedRows = rows.filter((r) => selectedPaths.has(r.relativePath) && !r.isDirectory);
    const eligibleRows = selectedRows.filter((r) =>
      direction === 'left-to-right' ? r.leftExists : r.rightExists,
    );

    if (eligibleRows.length === 0) {
      setError('No eligible files found to copy in the selected items.');
      return;
    }

    setSyncingState({
      relativePath: 'batch',
      name: `${eligibleRows.length} files`,
      direction,
    });
    setError(null);
    setSyncSuccessMsg(null);

    let copiedCount = 0;
    try {
      for (const row of eligibleRows) {
        const src = direction === 'left-to-right' ? row.leftFullPath : row.rightFullPath;
        const dest = direction === 'left-to-right' ? row.rightFullPath : row.leftFullPath;
        await api.copyFile(src, dest);
        copiedCount++;
        setSyncSuccessMsg(`Copying files (${copiedCount}/${eligibleRows.length})…`);
      }

      await runCompare(true);
      setSelectedPaths(new Set());
      setLastSelectedPath(null);
      const dirLabel = direction === 'left-to-right' ? 'left → right' : 'right → left';
      setSyncSuccessMsg(`Copied ${copiedCount} files (${dirLabel})`);
      setTimeout(() => setSyncSuccessMsg(null), 3500);
    } catch (err: any) {
      setError(`Batch sync failed after copying ${copiedCount} files: ${err?.message || String(err)}`);
    } finally {
      setSyncingState(null);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteConfirmTarget) return;
    try {
      setLoading(true);
      await api.deleteItem(deleteConfirmTarget.path);
      setSyncSuccessMsg(`Deleted "${deleteConfirmTarget.name}"`);
      setTimeout(() => setSyncSuccessMsg(null), 3000);
      setDeleteConfirmTarget(null);
      setSelectedPaths(new Set());
      setLastSelectedPath(null);
      await runCompare(true);
    } catch (err: any) {
      setError(`Delete failed: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchDelete = async () => {
    if (!deleteConfirmTargetBatch || deleteConfirmTargetBatch.length === 0) return;
    setLoading(true);
    let deletedCount = 0;
    try {
      for (const target of deleteConfirmTargetBatch) {
        await api.deleteItem(target.path);
        deletedCount++;
      }
      setSyncSuccessMsg(`Deleted ${deletedCount} items`);
      setTimeout(() => setSyncSuccessMsg(null), 3500);
      setSelectedPaths(new Set());
      setDeleteConfirmTargetBatch(null);
      await runCompare(true);
    } catch (err: any) {
      setError(`Batch delete failed: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const dirStatusMap = useMemo(() => {
    const map = new Map<
      string,
      {
        leftHasNewer: boolean;
        rightHasNewer: boolean;
        leftHasOnly: boolean;
        rightHasOnly: boolean;
        hasDiff: boolean;
      }
    >();

    const modifiedFiles = rows.filter((r) => !r.isDirectory && r.status === 'different');
    const leftOnlyItems = rows.filter((r) => r.leftExists && !r.rightExists);
    const rightOnlyItems = rows.filter((r) => !r.leftExists && r.rightExists);

    rows.forEach((r) => {
      if (r.isDirectory) {
        const prefix = r.relativePath + '/';
        let leftHasNewer = false;
        let rightHasNewer = false;
        let leftHasOnly = r.leftExists && !r.rightExists;
        let rightHasOnly = !r.leftExists && r.rightExists;
        let hasDiff = false;

        for (const mf of modifiedFiles) {
          if (mf.relativePath.startsWith(prefix)) {
            hasDiff = true;
            if (mf.leftMtime - mf.rightMtime > 2000) {
              leftHasNewer = true;
            } else if (mf.rightMtime - mf.leftMtime > 2000) {
              rightHasNewer = true;
            } else if (mf.leftSize !== mf.rightSize) {
              leftHasNewer = true;
              rightHasNewer = true;
            }
          }
        }

        if (!leftHasOnly) {
          leftHasOnly = leftOnlyItems.some((item) => item.relativePath.startsWith(prefix));
        }
        if (!rightHasOnly) {
          rightHasOnly = rightOnlyItems.some((item) => item.relativePath.startsWith(prefix));
        }

        map.set(r.relativePath, { leftHasNewer, rightHasNewer, leftHasOnly, rightHasOnly, hasDiff });
      }
    });

    return map;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const baseRows = showHidden ? rows : rows.filter((row) => !row.isHidden);

    if (filter === 'all') {
      return baseRows.filter((row) => isRowVisible(row.relativePath));
    }

    // 1. Find all matching file relative paths
    const matchingFilePaths = new Set<string>();
    baseRows.forEach((row) => {
      if (!row.isDirectory) {
        let isMatch = false;
        if (filter === 'diff') isMatch = row.status !== 'identical';
        else if (filter === 'same') isMatch = row.status === 'identical';
        else if (filter === 'leftOnly') isMatch = row.status === 'leftOnly';
        else if (filter === 'rightOnly') isMatch = row.status === 'rightOnly';

        if (isMatch) {
          matchingFilePaths.add(row.relativePath);
        }
      }
    });

    // 2. Find all ancestor directory paths to preserve folder hierarchy
    const neededDirPaths = new Set<string>();
    matchingFilePaths.forEach((filePath) => {
      const parts = filePath.split('/');
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        neededDirPaths.add(current);
      }
    });

    // 3. Keep matching files and their parent directory rows
    return baseRows.filter((row) => {
      if (!isRowVisible(row.relativePath)) return false;

      if (row.isDirectory) {
        return neededDirPaths.has(row.relativePath);
      }
      return matchingFilePaths.has(row.relativePath);
    });
  }, [rows, filter, expandedPaths, showHidden]);

  const handleRowClick = (e: React.MouseEvent, row: CompareRow) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(row.relativePath)) {
          next.delete(row.relativePath);
        } else {
          next.add(row.relativePath);
        }
        return next;
      });
      setLastSelectedPath(row.relativePath);
    } else if (e.shiftKey && lastSelectedPath) {
      const startIdx = filteredRows.findIndex((r) => r.relativePath === lastSelectedPath);
      const endIdx = filteredRows.findIndex((r) => r.relativePath === row.relativePath);
      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        const rangeSet = new Set(selectedPaths);
        for (let i = min; i <= max; i++) {
          rangeSet.add(filteredRows[i].relativePath);
        }
        setSelectedPaths(rangeSet);
      }
    } else {
      if (row.isDirectory) {
        toggleExpand(row.relativePath);
      }
      setSelectedPaths(new Set([row.relativePath]));
      setLastSelectedPath(row.relativePath);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedPaths.size === 0) return;
    const targetsToDelete: { path: string; name: string; isDirectory: boolean; side: 'left' | 'right' }[] = [];
    rows
      .filter((r) => selectedPaths.has(r.relativePath))
      .forEach((r) => {
        if (r.leftExists) targetsToDelete.push({ path: r.leftFullPath, name: r.name, isDirectory: r.isDirectory, side: 'left' });
        if (r.rightExists) targetsToDelete.push({ path: r.rightFullPath, name: r.name, isDirectory: r.isDirectory, side: 'right' });
      });
    if (targetsToDelete.length > 0) {
      setDeleteConfirmTargetBatch(targetsToDelete);
      if (contextMenu) setContextMenu(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        runCompare(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const allPaths = new Set(filteredRows.map((r) => r.relativePath));
        setSelectedPaths(allPaths);
      } else if (e.key === 'Escape') {
        if (deleteConfirmTarget || deleteConfirmTargetBatch) {
          setDeleteConfirmTarget(null);
          setDeleteConfirmTargetBatch(null);
        } else {
          setSelectedPaths(new Set());
          if (contextMenu) setContextMenu(null);
        }
      } else if (e.key === 'Enter') {
        if (deleteConfirmTarget) {
          e.preventDefault();
          handleDeleteItem();
        } else if (deleteConfirmTargetBatch) {
          e.preventDefault();
          handleBatchDelete();
        }
      } else if (e.key === 'Delete' || e.key === 'Del') {
        if (selectedPaths.size > 0 && !deleteConfirmTarget && !deleteConfirmTargetBatch) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredRows, selectedPaths, rows, deleteConfirmTarget, deleteConfirmTargetBatch, contextMenu, leftPath, rightPath, expandedPaths]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (mtimeMs: number) => {
    if (mtimeMs === 0) return '-';
    return new Date(mtimeMs).toLocaleString('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px', position: 'relative' }}>
      {(syncingState || syncSuccessMsg) && (
        <div className={`status-toast ${syncingState ? 'is-busy' : ''}`}>
          {syncingState ? (
            <>
              <RefreshCw size={13} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
              <span>
                Copying "{syncingState.name}" ({syncingState.direction === 'left-to-right' ? 'left → right' : 'right → left'})…
              </span>
            </>
          ) : (
            <>
              <Check size={13} style={{ color: 'var(--success)' }} />
              <span>{syncSuccessMsg}</span>
            </>
          )}
        </div>
      )}

      {/* Path Input Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Left Folder Input */}
          <div style={{ flex: 1, display: 'flex', gap: '4px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Left folder"
              value={leftPath}
              list="left-folder-history-list"
              onChange={(e) => setLeftPath(e.target.value)}
              style={{ flex: 1, height: '28px' }}
            />
            <datalist id="left-folder-history-list">
              {leftHistory.map((item, idx) => (
                <option key={idx} value={item} />
              ))}
            </datalist>
            <button className="btn" onClick={selectLeftFolder} style={{ height: '28px', padding: '0 8px' }} title="Browse Left Folder">
              <FolderOpen size={14} />
            </button>
          </div>

          {/* Right Folder Input */}
          <div style={{ flex: 1, display: 'flex', gap: '4px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Right folder"
              value={rightPath}
              list="right-folder-history-list"
              onChange={(e) => setRightPath(e.target.value)}
              style={{ flex: 1, height: '28px' }}
            />
            <datalist id="right-folder-history-list">
              {rightHistory.map((item, idx) => (
                <option key={idx} value={item} />
              ))}
            </datalist>
            <button className="btn" onClick={selectRightFolder} style={{ height: '28px', padding: '0 8px' }} title="Browse Right Folder">
              <FolderOpen size={14} />
            </button>
          </div>

          {/* Compare Button */}
          <button
            className="btn btn-primary"
            onClick={() => runCompare(false)}
            disabled={loading}
            style={{ height: '28px' }}
          >
            {loading && <RefreshCw size={13} className="animate-spin" />}
            Compare
          </button>

          {/* Refresh Button */}
          <button
            className="btn"
            onClick={() => runCompare(true)}
            disabled={loading || !leftPath || !rightPath}
            style={{ height: '28px', padding: '0 8px' }}
            title="Refresh (F5)"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--st-newer)', fontSize: '0.8rem' }}>
            <AlertCircle size={13} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Toolbar / Filters / Bulk Action Bar */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className="segmented">
              <button onClick={() => setFilter('all')} className={filter === 'all' ? 'is-active' : ''} title="All files">
                All
              </button>
              <button onClick={() => setFilter('diff')} className={filter === 'diff' ? 'is-active' : ''} title="Differences only">
                <GitCompare size={12} />
                Diffs
              </button>
              <button onClick={() => setFilter('same')} className={filter === 'same' ? 'is-active' : ''} title="Identical only">
                <Equal size={12} />
                Same
              </button>
              <button onClick={() => setFilter('leftOnly')} className={filter === 'leftOnly' ? 'is-active' : ''} title="Left only">
                <ArrowLeft size={12} />
                Left only
              </button>
              <button onClick={() => setFilter('rightOnly')} className={filter === 'rightOnly' ? 'is-active' : ''} title="Right only">
                <ArrowRight size={12} />
                Right only
              </button>
            </div>
            <div className="segmented">
              <button
                onClick={() => setShowHidden((prev) => !prev)}
                className={showHidden ? 'is-active' : ''}
                title="숨김 파일 표시"
              >
                {showHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                숨김 파일
              </button>
            </div>
          </div>

          {/* Bulk Action Bar */}
          {selectedPaths.size > 1 && !syncingState && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '2px' }}>
                {selectedPaths.size} selected
              </span>
              <button
                className="btn"
                onClick={() => handleSyncBatch('left-to-right')}
                disabled={!!syncingState}
                style={{ padding: '0 8px', fontSize: '0.75rem', height: '24px' }}
                title="Copy all selected left files to right"
              >
                <ArrowRight size={12} />
                Copy to right
              </button>
              <button
                className="btn"
                onClick={() => handleSyncBatch('right-to-left')}
                disabled={!!syncingState}
                style={{ padding: '0 8px', fontSize: '0.75rem', height: '24px' }}
                title="Copy all selected right files to left"
              >
                <ArrowLeft size={12} />
                Copy to left
              </button>
              <button
                className="btn"
                onClick={handleDeleteSelected}
                style={{ padding: '0 8px', fontSize: '0.75rem', height: '24px' }}
                title="Delete all selected files/folders (Delete)"
              >
                <Trash2 size={12} />
                Delete
              </button>
              <button
                onClick={() => setSelectedPaths(new Set())}
                className="icon-btn"
                title="Clear selection (Esc)"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Double-click a file to compare its contents
          </div>
        </div>
      )}

      {/* Main Grid View */}
      <div className="panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {rows.length === 0 ? (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <span>Pick two folders and press Compare.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Headers */}
            <div style={{ display: 'flex', background: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.75rem', userSelect: 'none' }}>
              {/* Left Header */}
              <div style={{ flex: '1', display: 'grid', gridTemplateColumns: gridLayout, padding: '0 12px', position: 'relative' }}>
                <div style={{ padding: '5px 8px 5px 0', position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>Left</span>
                  <div
                    className={`column-resizer column-resizer-right ${resizing === 'size' ? 'is-resizing' : ''}`}
                    onMouseDown={(e) => startResize('size', e)}
                    onDoubleClick={(e) => { e.stopPropagation(); setSizeWidth(100); }}
                    title="Drag to resize Size column (Double-click to reset)"
                  />
                </div>
                <div style={{ padding: '5px 8px 5px 0', textAlign: 'right', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>Size</span>
                  <div
                    className={`column-resizer column-resizer-right ${resizing === 'modified' ? 'is-resizing' : ''}`}
                    onMouseDown={(e) => startResize('modified', e)}
                    onDoubleClick={(e) => { e.stopPropagation(); setModifiedWidth(200); }}
                    title="Drag to resize Modified column (Double-click to reset)"
                  />
                </div>
                <div style={{ padding: '5px 0 5px 16px', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>Modified</span>
                </div>
              </div>

              {/* Sync Header */}
              <div style={{ width: '54px', borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }} />

              {/* Right Header */}
              <div style={{ flex: '1', display: 'grid', gridTemplateColumns: gridLayout, padding: '0 12px', position: 'relative' }}>
                <div style={{ padding: '5px 8px 5px 0', position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>Right</span>
                  <div
                    className={`column-resizer column-resizer-right ${resizing === 'size' ? 'is-resizing' : ''}`}
                    onMouseDown={(e) => startResize('size', e)}
                    onDoubleClick={(e) => { e.stopPropagation(); setSizeWidth(100); }}
                    title="Drag to resize Size column (Double-click to reset)"
                  />
                </div>
                <div style={{ padding: '5px 8px 5px 0', textAlign: 'right', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>Size</span>
                  <div
                    className={`column-resizer column-resizer-right ${resizing === 'modified' ? 'is-resizing' : ''}`}
                    onMouseDown={(e) => startResize('modified', e)}
                    onDoubleClick={(e) => { e.stopPropagation(); setModifiedWidth(200); }}
                    title="Drag to resize Modified column (Double-click to reset)"
                  />
                </div>
                <div style={{ padding: '5px 0 5px 16px', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>Modified</span>
                </div>
              </div>
            </div>

            {/* List Body */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredRows.length === 0 ? (
                <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  <span>
                    {filter === 'all'
                      ? 'Nothing to show.'
                      : 'No items match this filter.'}
                  </span>
                </div>
              ) : (
                <>
                  {filteredRows.map((row) => {
                    const isSelected = selectedPaths.has(row.relativePath);

                    const leftBg = isSelected ? 'var(--bg-selection)' : 'transparent';
                    const rightBg = isSelected ? 'var(--bg-selection)' : 'transparent';

                    let leftTextColor = 'var(--text-primary)';
                    let leftIconColor = 'var(--text-secondary)';
                    let rightTextColor = 'var(--text-primary)';
                    let rightIconColor = 'var(--text-secondary)';

                    if (row.isDirectory) {
                      const dirStatus = dirStatusMap.get(row.relativePath);
                      if (row.leftExists) {
                        if (dirStatus?.leftHasNewer) {
                          leftTextColor = 'var(--st-newer)';
                          leftIconColor = 'var(--st-newer)';
                        } else if (dirStatus?.leftHasOnly) {
                          leftTextColor = 'var(--st-orphan)';
                          leftIconColor = 'var(--st-orphan)';
                        } else {
                          leftTextColor = 'var(--st-older)';
                          leftIconColor = 'var(--st-older)';
                        }
                      }

                      if (row.rightExists) {
                        if (dirStatus?.rightHasNewer) {
                          rightTextColor = 'var(--st-newer)';
                          rightIconColor = 'var(--st-newer)';
                        } else if (dirStatus?.rightHasOnly) {
                          rightTextColor = 'var(--st-orphan)';
                          rightIconColor = 'var(--st-orphan)';
                        } else {
                          rightTextColor = 'var(--st-older)';
                          rightIconColor = 'var(--st-older)';
                        }
                      }
                    } else {
                      // File row
                      if (row.leftExists && row.rightExists) {
                        const isTimeDiff = Math.abs(row.leftMtime - row.rightMtime) > 2000;
                        const isSizeDiff = row.leftSize !== row.rightSize;

                        if (isTimeDiff) {
                          if (row.leftMtime > row.rightMtime) {
                            leftTextColor = 'var(--st-newer)';
                            leftIconColor = 'var(--st-newer)';
                            rightTextColor = 'var(--st-older)';
                            rightIconColor = 'var(--st-older)';
                          } else {
                            leftTextColor = 'var(--st-older)';
                            leftIconColor = 'var(--st-older)';
                            rightTextColor = 'var(--st-newer)';
                            rightIconColor = 'var(--st-newer)';
                          }
                        } else if (isSizeDiff) {
                          leftTextColor = 'var(--st-newer)';
                          leftIconColor = 'var(--st-newer)';
                          rightTextColor = 'var(--st-newer)';
                          rightIconColor = 'var(--st-newer)';
                        } else {
                          leftTextColor = 'var(--text-primary)';
                          leftIconColor = 'var(--st-older)';
                          rightTextColor = 'var(--text-primary)';
                          rightIconColor = 'var(--st-older)';
                        }
                      } else if (row.leftExists) {
                        leftTextColor = 'var(--st-orphan)';
                        leftIconColor = 'var(--st-orphan)';
                      } else if (row.rightExists) {
                        rightTextColor = 'var(--st-orphan)';
                        rightIconColor = 'var(--st-orphan)';
                      }
                    }

                    const isExpanded = expandedPaths.has(row.relativePath);

                    return (
                      <div
                        key={row.relativePath}
                        onClick={(e) => handleRowClick(e, row)}
                        onDoubleClick={() => {
                          if (!row.isDirectory && (row.leftExists || row.rightExists)) {
                            onOpenTextCompare(row.leftFullPath, row.rightFullPath);
                          }
                        }}
                        style={{
                          display: 'flex',
                          borderBottom: '1px solid var(--border-subtle)',
                          fontSize: '0.8rem',
                          fontVariantNumeric: 'tabular-nums',
                          cursor: 'pointer',
                          opacity: row.isHidden ? 0.65 : 1,
                        }}
                      >
                        {/* Left Side */}
                        <div
                          style={{
                            flex: '1',
                            display: 'grid',
                            gridTemplateColumns: gridLayout,
                            padding: '0 12px',
                            backgroundColor: leftBg,
                            alignItems: 'center',
                          }}
                          onContextMenu={(e) => {
                            if (row.leftExists) {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!selectedPaths.has(row.relativePath)) {
                                setSelectedPaths(new Set([row.relativePath]));
                                setLastSelectedPath(row.relativePath);
                              }
                              setContextMenu({
                                mouseX: e.clientX,
                                mouseY: e.clientY,
                                row,
                                side: 'left',
                                targetPath: row.leftFullPath,
                              });
                            }
                          }}
                        >
                          {row.leftExists ? (
                            <>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  paddingLeft: `${row.depth * 16}px`,
                                  color: leftTextColor,
                                  fontWeight: 400,
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  minWidth: 0,
                                  height: '24px',
                                }}
                              >
                                {row.isDirectory ? (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleExpand(row.relativePath);
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      cursor: 'pointer',
                                      marginRight: '4px',
                                    }}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown size={12} style={{ color: leftIconColor }} />
                                    ) : (
                                      <ChevronRight size={12} style={{ color: leftIconColor }} />
                                    )}
                                    <Folder size={14} style={{ color: leftIconColor, marginLeft: '2px', marginRight: '6px' }} />
                                  </span>
                                ) : (
                                  <div style={{ width: '12px', marginRight: '6px' }} />
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
                              </div>

                              <div style={{ textAlign: 'right', color: 'var(--text-secondary)', paddingRight: '8px', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                {row.isDirectory ? '-' : formatSize(row.leftSize)}
                              </div>

                              <div style={{ color: leftTextColor, paddingLeft: '16px', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                {row.isDirectory ? '-' : formatDate(row.leftMtime)}
                              </div>
                            </>
                          ) : (
                            <div style={{ height: '24px' }} />
                          )}
                        </div>

                        {/* Sync Column (54px fixed) */}
                        <div
                          style={{
                            width: '54px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            borderLeft: '1px solid var(--border-color)',
                            borderRight: '1px solid var(--border-color)',
                            background: isSelected ? 'var(--bg-selection)' : 'var(--bg-gutter)',
                          }}
                        >
                          {!row.isDirectory && (
                            <>
                              {row.leftExists && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSyncFile(row, 'left-to-right');
                                  }}
                                  disabled={!!syncingState}
                                  title="Copy Left to Right"
                                  className="icon-btn"
                                  style={{ padding: '2px' }}
                                >
                                  <ArrowRight size={13} />
                                </button>
                              )}
                              {row.rightExists && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSyncFile(row, 'right-to-left');
                                  }}
                                  disabled={!!syncingState}
                                  title="Copy Right to Left"
                                  className="icon-btn"
                                  style={{ padding: '2px' }}
                                >
                                  <ArrowLeft size={13} />
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        {/* Right Side */}
                        <div
                          style={{
                            flex: '1',
                            display: 'grid',
                            gridTemplateColumns: gridLayout,
                            padding: '0 12px',
                            backgroundColor: rightBg,
                            alignItems: 'center',
                          }}
                          onContextMenu={(e) => {
                            if (row.rightExists) {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!selectedPaths.has(row.relativePath)) {
                                setSelectedPaths(new Set([row.relativePath]));
                                setLastSelectedPath(row.relativePath);
                              }
                              setContextMenu({
                                mouseX: e.clientX,
                                mouseY: e.clientY,
                                row,
                                side: 'right',
                                targetPath: row.rightFullPath,
                              });
                            }
                          }}
                        >
                          {row.rightExists ? (
                            <>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  paddingLeft: `${row.depth * 16}px`,
                                  color: rightTextColor,
                                  fontWeight: 400,
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  minWidth: 0,
                                  height: '24px',
                                }}
                              >
                                {row.isDirectory ? (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleExpand(row.relativePath);
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      cursor: 'pointer',
                                      marginRight: '4px',
                                    }}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown size={12} style={{ color: rightIconColor }} />
                                    ) : (
                                      <ChevronRight size={12} style={{ color: rightIconColor }} />
                                    )}
                                    <Folder size={14} style={{ color: rightIconColor, marginLeft: '2px', marginRight: '6px' }} />
                                  </span>
                                ) : (
                                  <div style={{ width: '12px', marginRight: '6px' }} />
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
                              </div>

                              <div style={{ textAlign: 'right', color: 'var(--text-secondary)', paddingRight: '8px', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                {row.isDirectory ? '-' : formatSize(row.rightSize)}
                              </div>

                              <div style={{ color: rightTextColor, paddingLeft: '16px', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                {row.isDirectory ? '-' : formatDate(row.rightMtime)}
                              </div>
                            </>
                          ) : (
                            <div style={{ height: '24px' }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Context Menu Modal */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.mouseY,
            left: contextMenu.mouseX,
            zIndex: 100,
            background: 'var(--bg-panel-solid)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
            borderRadius: '2px',
            padding: '4px 0',
            minWidth: '200px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '4px 10px 6px', fontSize: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
              {selectedPaths.size > 1 ? `${selectedPaths.size} items selected` : contextMenu.row.name}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {contextMenu.side === 'left' ? 'Left' : 'Right'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '4px' }}>
            {!contextMenu.row.isDirectory && selectedPaths.size <= 1 && (
              <button
                className="btn-menu-item"
                onClick={() => {
                  onOpenTextCompare(contextMenu.row.leftFullPath, contextMenu.row.rightFullPath);
                  setContextMenu(null);
                }}
              >
                <FileCode size={14} />
                <span>Compare Contents</span>
              </button>
            )}

            <button
              className="btn-menu-item"
              onClick={() => {
                runCompare(true);
                setContextMenu(null);
              }}
            >
              <RefreshCw size={14} />
              <span>Refresh (F5)</span>
            </button>

            <button
              className="btn-menu-item"
              onClick={() => {
                const targetDirection = contextMenu.side === 'left' ? 'left-to-right' : 'right-to-left';
                if (selectedPaths.size > 1) {
                  handleSyncBatch(targetDirection);
                } else {
                  handleSyncFile(contextMenu.row, targetDirection);
                }
                setContextMenu(null);
              }}
              disabled={!!syncingState}
            >
              {contextMenu.side === 'left' ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
              <span>
                Copy {selectedPaths.size > 1 ? `${selectedPaths.size} items` : ''} to {contextMenu.side === 'left' ? 'Right' : 'Left'}
              </span>
            </button>

            <button
              className="btn-menu-item"
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.targetPath);
                setSyncSuccessMsg('Path copied');
                setTimeout(() => setSyncSuccessMsg(null), 2500);
                setContextMenu(null);
              }}
            >
              <Copy size={14} />
              <span>Copy Path</span>
            </button>

            <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

            <button
              className="btn-menu-item"
              onClick={() => {
                if (selectedPaths.size > 1) {
                  handleDeleteSelected();
                } else {
                  setDeleteConfirmTarget({
                    path: contextMenu.targetPath,
                    name: contextMenu.row.name,
                    isDirectory: contextMenu.row.isDirectory,
                    side: contextMenu.side,
                  });
                }
                setContextMenu(null);
              }}
            >
              <Trash2 size={14} />
              <span>
                Delete {selectedPaths.size > 1 ? `${selectedPaths.size} items` : contextMenu.row.isDirectory ? 'folder' : 'file'}…
              </span>
            </button>
          </div>
        </div>
      )}

      {deleteConfirmTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirmTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete {deleteConfirmTarget.isDirectory ? 'folder' : 'file'}?</h3>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '10px' }}>
              <span style={{ color: 'var(--text-primary)' }}>{deleteConfirmTarget.name}</span> will be permanently deleted.
            </p>

            <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '16px', wordBreak: 'break-all', userSelect: 'text' }}>
              {deleteConfirmTarget.path}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn" onClick={() => setDeleteConfirmTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteItem}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmTargetBatch && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirmTargetBatch(null)}>
          <div className="modal" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <h3>Delete {deleteConfirmTargetBatch.length} items?</h3>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '10px' }}>
              These will be permanently deleted.
            </p>

            <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-color)', background: 'var(--bg-app)', padding: '6px 8px', marginBottom: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {deleteConfirmTargetBatch.slice(0, 10).map((t, idx) => (
                <div key={idx} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>{t.side === 'left' ? 'L' : 'R'}</span>
                  {t.name}
                </div>
              ))}
              {deleteConfirmTargetBatch.length > 10 && (
                <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                  and {deleteConfirmTargetBatch.length - 10} more
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn" onClick={() => setDeleteConfirmTargetBatch(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleBatchDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
