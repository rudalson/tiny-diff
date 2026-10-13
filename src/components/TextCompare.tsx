import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import {
  FileText,
  FolderOpen,
  Save,
  RefreshCw,
  AlertCircle,
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  GitCompare,
} from 'lucide-react';
import { api, DiffRow } from '../api';

interface TextCompareProps {
  initialLeftPath?: string;
  initialRightPath?: string;
  updateTitle: (title: string) => void;
}

export default function TextCompare({
  initialLeftPath,
  initialRightPath,
  updateTitle,
}: TextCompareProps) {
  const [leftPath, setLeftPath] = useState<string>(() => {
    return initialLeftPath || localStorage.getItem('tinydiff_last_left_file') || '';
  });
  const [rightPath, setRightPath] = useState<string>(() => {
    return initialRightPath || localStorage.getItem('tinydiff_last_right_file') || '';
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [diffRows, setDiffRows] = useState<DiffRow[]>([]);
  const [viewMode, setViewMode] = useState<'all' | 'diffOnly'>('all');
  const [stats, setStats] = useState<{
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  }>({ added: 0, removed: 0, modified: 0, unchanged: 0 });
  const [leftSaveSuccess, setLeftSaveSuccess] = useState<boolean>(false);
  const [rightSaveSuccess, setRightSaveSuccess] = useState<boolean>(false);
  const [isLeftDirty, setIsLeftDirty] = useState<boolean>(false);
  const [isRightDirty, setIsRightDirty] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const leftLineNumbersRef = useRef<HTMLDivElement>(null);
  const rightLineNumbersRef = useRef<HTMLDivElement>(null);
  const mergeColumnRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef<boolean>(false);

  const rowsToDisplay = useMemo(() => {
    return diffRows
      .map((row, originalIndex) => ({ ...row, originalIndex }))
      .filter((row) => viewMode === 'all' || row.type !== 'unchanged');
  }, [diffRows, viewMode]);

  const saveFileHistory = (side: 'left' | 'right', pathStr: string) => {
    if (!pathStr) return;
    const lastKey = side === 'left' ? 'tinydiff_last_left_file' : 'tinydiff_last_right_file';
    localStorage.setItem(lastKey, pathStr);
  };

  useEffect(() => {
    if (initialLeftPath && initialRightPath) {
      runCompare();
    }
  }, [initialLeftPath, initialRightPath]);

  const selectLeftFile = async () => {
    const startPath = leftPath || localStorage.getItem('tinydiff_last_left_file') || undefined;
    const path = await api.selectFile(startPath);
    if (path) {
      setLeftPath(path);
      saveFileHistory('left', path);
      const filename = path.split(/[\\/]/).pop() || 'File';
      updateTitle(`TC: ${filename}`);
    }
  };

  const selectRightFile = async () => {
    const startPath = rightPath || localStorage.getItem('tinydiff_last_right_file') || undefined;
    const path = await api.selectFile(startPath);
    if (path) {
      setRightPath(path);
      saveFileHistory('right', path);
      if (leftPath) {
        const fileLeft = leftPath.split(/[\\/]/).pop() || 'File';
        const fileRight = path.split(/[\\/]/).pop() || 'File';
        updateTitle(`${fileLeft} ↔ ${fileRight}`);
      }
    }
  };

  const runCompare = async () => {
    if (!leftPath || !rightPath) {
      setError('Both file paths must be selected before comparing.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await api.compareFiles(leftPath, rightPath);
      setDiffRows(result.rows);
      setStats(result.stats);
      setIsLeftDirty(false);
      setIsRightDirty(false);
    } catch (err: any) {
      setError(err?.message || String(err) || 'Error occurred while comparing files.');
    } finally {
      setLoading(false);
    }
  };

  // 100% Sync scroll implementation
  const handleScroll = (source: 'left' | 'right') => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;

    const srcRef = source === 'left' ? leftPaneRef : rightPaneRef;
    if (srcRef.current) {
      const scrollTop = srcRef.current.scrollTop;
      const scrollLeft = srcRef.current.scrollLeft;

      if (leftPaneRef.current && source !== 'left') {
        leftPaneRef.current.scrollTop = scrollTop;
        leftPaneRef.current.scrollLeft = scrollLeft;
      }
      if (rightPaneRef.current && source !== 'right') {
        rightPaneRef.current.scrollTop = scrollTop;
        rightPaneRef.current.scrollLeft = scrollLeft;
      }
      if (leftLineNumbersRef.current) {
        leftLineNumbersRef.current.scrollTop = scrollTop;
      }
      if (rightLineNumbersRef.current) {
        rightLineNumbersRef.current.scrollTop = scrollTop;
      }
      if (mergeColumnRef.current) {
        mergeColumnRef.current.scrollTop = scrollTop;
      }
    }

    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  const recalcStats = (rows: DiffRow[]) => {
    let added = 0;
    let removed = 0;
    let modified = 0;
    let unchanged = 0;

    for (const r of rows) {
      if (r.type === 'added') added++;
      else if (r.type === 'removed') removed++;
      else if (r.type === 'modified') modified++;
      else if (r.type === 'unchanged') unchanged++;
    }
    setStats({ added, removed, modified, unchanged });
  };

  // Merge operations (< and >)
  const handleMergeLine = (index: number, direction: 'left-to-right' | 'right-to-left') => {
    const updated = [...diffRows];
    const target = updated[index];

    if (direction === 'left-to-right') {
      target.rightContent = target.leftContent;
      if (target.type === 'removed') {
        target.type = 'unchanged';
      } else if (target.type === 'modified') {
        target.type = 'unchanged';
      }
      setIsRightDirty(true);
    } else {
      target.leftContent = target.rightContent;
      if (target.type === 'added') {
        target.type = 'unchanged';
      } else if (target.type === 'modified') {
        target.type = 'unchanged';
      }
      setIsLeftDirty(true);
    }
    setDiffRows(updated);
    recalcStats(updated);
  };

  const handleEditLine = (index: number, side: 'left' | 'right', text: string) => {
    const updated = [...diffRows];
    const target = updated[index];

    if (side === 'left') {
      target.leftContent = text;
      setIsLeftDirty(true);
    } else {
      target.rightContent = text;
      setIsRightDirty(true);
    }

    if (target.leftContent !== target.rightContent) {
      target.type = 'modified';
    } else {
      target.type = 'unchanged';
    }

    setDiffRows(updated);
    recalcStats(updated);
  };

  const saveFile = async (side: 'left' | 'right') => {
    const path = side === 'left' ? leftPath : rightPath;
    if (!path) return;

    const content = diffRows
      .filter((row) => (side === 'left' ? row.type !== 'added' : row.type !== 'removed'))
      .map((row) => (side === 'left' ? row.leftContent : row.rightContent))
      .join('\n');

    try {
      await api.writeFile(path, content);
      const filename = path.split(/[\\/]/).pop() || (side === 'left' ? 'Left File' : 'Right File');
      if (side === 'left') {
        setLeftSaveSuccess(true);
        setIsLeftDirty(false);
        setTimeout(() => setLeftSaveSuccess(false), 2000);
      } else {
        setRightSaveSuccess(true);
        setIsRightDirty(false);
        setTimeout(() => setRightSaveSuccess(false), 2000);
      }
      setSaveSuccessMsg(`Successfully saved "${filename}"`);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(`Failed to save: ${err?.message || String(err)}`);
    }
  };

  const saveAllFiles = async () => {
    let savedCount = 0;
    if (isLeftDirty) {
      await saveFile('left');
      savedCount++;
    }
    if (isRightDirty) {
      await saveFile('right');
      savedCount++;
    }
    if (savedCount > 0) {
      setSaveSuccessMsg('Saved all modified files successfully');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        runCompare();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveAllFiles();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [leftPath, rightPath, isLeftDirty, isRightDirty, diffRows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 16px', position: 'relative' }}>
      {/* Bottom Center Toast Notification Overlay */}
      {saveSuccessMsg && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 22px',
            borderRadius: '30px',
            background: 'rgba(6, 78, 59, 0.94)',
            border: '1px solid rgba(52, 211, 153, 0.7)',
            boxShadow: '0 12px 30px -5px rgba(16, 185, 129, 0.5), 0 0 20px rgba(16, 185, 129, 0.3)',
            backdropFilter: 'blur(12px)',
            color: 'white',
            fontSize: '0.85rem',
            fontWeight: 600,
            pointerEvents: 'auto',
          }}
        >
          <Check size={16} style={{ color: '#34d399' }} />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* File Path Picker Bar */}
      <div className="glass-panel" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Left File Input */}
          <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Left File Path"
              value={leftPath}
              onChange={(e) => setLeftPath(e.target.value)}
              style={{ flex: 1, height: '34px', padding: '6px 10px', fontSize: '0.8rem' }}
            />
            <button className="btn" onClick={selectLeftFile} style={{ height: '34px', padding: '0 10px', fontSize: '0.8rem' }} title="Browse Left File">
              <FolderOpen size={15} />
            </button>
          </div>

          <ArrowLeftRight size={16} style={{ color: 'var(--text-muted)' }} />

          {/* Right File Input */}
          <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Right File Path"
              value={rightPath}
              onChange={(e) => setRightPath(e.target.value)}
              style={{ flex: 1, height: '34px', padding: '6px 10px', fontSize: '0.8rem' }}
            />
            <button className="btn" onClick={selectRightFile} style={{ height: '34px', padding: '0 10px', fontSize: '0.8rem' }} title="Browse Right File">
              <FolderOpen size={15} />
            </button>
          </div>

          {/* Compare Button */}
          <button
            className="btn btn-primary"
            onClick={runCompare}
            disabled={loading}
            style={{ height: '34px', paddingLeft: '16px', paddingRight: '16px', fontSize: '0.8rem' }}
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
            Compare
          </button>

          {/* Refresh Button */}
          <button
            className="btn"
            onClick={runCompare}
            disabled={loading || !leftPath || !rightPath}
            style={{ height: '34px', padding: '0 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}
            title="Refresh File Compare (F5 / Ctrl+R)"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* View Mode Toggle Buttons */}
          <div style={{ display: 'flex', gap: '2px', background: 'rgba(0, 0, 0, 0.3)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)', height: '34px', alignItems: 'center' }}>
            <button
              className={`btn ${viewMode === 'all' ? 'btn-primary' : ''}`}
              onClick={() => setViewMode('all')}
              style={{ height: '28px', padding: '0 10px', fontSize: '0.75rem', border: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Show All Lines"
            >
              <Layers size={13} />
              <span>All</span>
            </button>
            <button
              className={`btn ${viewMode === 'diffOnly' ? 'btn-primary' : ''}`}
              onClick={() => setViewMode('diffOnly')}
              style={{ height: '28px', padding: '0 10px', fontSize: '0.75rem', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', color: viewMode === 'diffOnly' ? 'white' : 'var(--diff-modified-text)' }}
              title="Show Differences Only"
            >
              <GitCompare size={13} />
              <span>Diff Only</span>
            </button>
          </div>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '0.85rem' }}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Stats and Saves Panel */}
      {diffRows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          {/* Left save button */}
          <button
            onClick={() => saveFile('left')}
            className="btn"
            style={{
              padding: '6px 14px',
              fontSize: '0.75rem',
              fontWeight: isLeftDirty ? 600 : 400,
              background: isLeftDirty ? '#6366f1' : 'transparent',
              color: isLeftDirty ? 'white' : leftSaveSuccess ? '#10b981' : 'var(--text-primary)',
              borderColor: isLeftDirty ? '#6366f1' : leftSaveSuccess ? '#10b981' : 'var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Save Left File (Ctrl+S)"
          >
            {leftSaveSuccess ? <Check size={14} /> : <Save size={14} />}
            <span>{leftSaveSuccess ? 'Left Saved!' : isLeftDirty ? 'Save Left File ●' : 'Save Left File'}</span>
          </button>

          {/* Center: Save Both Files, View Mode, Stats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {(isLeftDirty || isRightDirty) && (
              <button
                onClick={saveAllFiles}
                className="btn"
                style={{
                  padding: '6px 14px',
                  fontSize: '0.75rem',
                  background: '#6366f1',
                  borderColor: '#6366f1',
                  color: 'white',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 0 10px rgba(99, 102, 241, 0.35)',
                }}
                title="Save both files (Ctrl+S)"
              >
                <Save size={14} />
                <span>Save Both Files (Ctrl+S)</span>
              </button>
            )}

            <div style={{ display: 'flex', gap: '2px', background: 'rgba(0, 0, 0, 0.25)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <button
                onClick={() => setViewMode('all')}
                style={{
                  padding: '3px 10px',
                  fontSize: '0.75rem',
                  height: '24px',
                  borderRadius: '4px',
                  border: 'none',
                  background: viewMode === 'all' ? 'var(--accent-color)' : 'transparent',
                  color: viewMode === 'all' ? 'white' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Show all lines"
              >
                <Layers size={12} />
                <span>All ({diffRows.length})</span>
              </button>

              <button
                onClick={() => setViewMode('diffOnly')}
                style={{
                  padding: '3px 10px',
                  fontSize: '0.75rem',
                  height: '24px',
                  borderRadius: '4px',
                  border: 'none',
                  background: viewMode === 'diffOnly' ? 'var(--accent-color)' : 'transparent',
                  color: viewMode === 'diffOnly' ? 'white' : 'var(--diff-modified-text)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: viewMode === 'diffOnly' ? 600 : 400,
                }}
                title="Show differences only"
              >
                <GitCompare size={12} />
                <span>Diff Only ({stats.modified + stats.added + stats.removed})</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '14px', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Unchanged: <strong style={{ color: 'var(--text-primary)' }}>{stats.unchanged}</strong>
              </span>
              <span style={{ color: 'var(--diff-removed-text)' }}>
                Removed: <strong>{stats.removed}</strong>
              </span>
              <span style={{ color: 'var(--diff-modified-text)' }}>
                Modified: <strong>{stats.modified}</strong>
              </span>
              <span style={{ color: 'var(--diff-added-text)' }}>
                Added: <strong>{stats.added}</strong>
              </span>
            </div>
          </div>

          {/* Right save button */}
          <button
            onClick={() => saveFile('right')}
            className="btn"
            style={{
              padding: '6px 14px',
              fontSize: '0.75rem',
              fontWeight: isRightDirty ? 600 : 400,
              background: isRightDirty ? '#10b981' : 'transparent',
              color: isRightDirty ? 'white' : rightSaveSuccess ? '#10b981' : 'var(--text-primary)',
              borderColor: isRightDirty ? '#10b981' : rightSaveSuccess ? '#10b981' : 'var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Save Right File (Ctrl+S)"
          >
            {rightSaveSuccess ? <Check size={14} /> : <Save size={14} />}
            <span>{rightSaveSuccess ? 'Right Saved!' : isRightDirty ? 'Save Right File ●' : 'Save Right File'}</span>
          </button>
        </div>
      )}

      {/* Editor Panel Split Screen (5 Columns, 22px strict height) */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {diffRows.length === 0 ? (
          <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
            <FileText size={48} style={{ strokeWidth: 1.5 }} />
            <span>Select left and right files and click Compare to start.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* 1 & 2: LEFT EDITOR PANE */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', borderRight: '1px solid var(--border-color)' }}>
              {/* 1: Left Line Numbers (45px) */}
              <div
                ref={leftLineNumbersRef}
                style={{
                  width: '45px',
                  backgroundColor: 'rgba(0,0,0,0.15)',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  textAlign: 'right',
                  paddingRight: '8px',
                  paddingTop: '10px',
                  userSelect: 'none',
                  overflow: 'hidden',
                  lineHeight: '22px',
                }}
              >
                {rowsToDisplay.map((row, displayIdx) => {
                  const prevRow = displayIdx > 0 ? rowsToDisplay[displayIdx - 1] : null;
                  const skippedCount = prevRow ? row.originalIndex - prevRow.originalIndex - 1 : 0;
                  const showDivider = viewMode === 'diffOnly' && skippedCount > 0;

                  let numColor = 'var(--text-muted)';
                  let numBg = 'transparent';
                  if (row.type === 'removed') {
                    numColor = 'var(--diff-removed-text)';
                    numBg = 'rgba(239, 68, 68, 0.15)';
                  } else if (row.type === 'modified') {
                    numColor = 'var(--diff-modified-text)';
                    numBg = 'rgba(59, 130, 246, 0.15)';
                  }

                  return (
                    <Fragment key={row.originalIndex}>
                      {showDivider && (
                        <div
                          style={{
                            height: '20px',
                            minHeight: '20px',
                            maxHeight: '20px',
                            flexShrink: 0,
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            color: 'var(--text-muted)',
                            fontSize: '0.65rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(0,0,0,0.3)',
                            borderTop: '1px dashed var(--border-color)',
                            borderBottom: '1px dashed var(--border-color)',
                          }}
                        >
                          ···
                        </div>
                      )}
                      <div
                        style={{
                          height: '22px',
                          minHeight: '22px',
                          maxHeight: '22px',
                          flexShrink: 0,
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          color: numColor,
                          backgroundColor: numBg,
                          fontWeight: row.type !== 'unchanged' ? 600 : 400,
                          lineHeight: '22px',
                        }}
                      >
                        {row.type !== 'added' ? row.leftLineNumber : ''}
                      </div>
                    </Fragment>
                  );
                })}
              </div>

              {/* 2: Left Content */}
              <div
                ref={leftPaneRef}
                onScroll={() => handleScroll('left')}
                style={{
                  flex: 1,
                  overflow: 'auto',
                  paddingTop: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  lineHeight: '22px',
                  whiteSpace: 'pre',
                }}
              >
                {rowsToDisplay.map((row, displayIdx) => {
                  const prevRow = displayIdx > 0 ? rowsToDisplay[displayIdx - 1] : null;
                  const skippedCount = prevRow ? row.originalIndex - prevRow.originalIndex - 1 : 0;
                  const showDivider = viewMode === 'diffOnly' && skippedCount > 0;

                  let bg = 'transparent';
                  let textColor = 'var(--text-primary)';
                  let borderLeft = '3px solid transparent';

                  if (row.type === 'removed') {
                    bg = 'var(--diff-removed-bg)';
                    textColor = 'var(--diff-removed-text)';
                    borderLeft = '3px solid var(--diff-removed-border)';
                  } else if (row.type === 'modified') {
                    bg = 'var(--diff-modified-bg)';
                    textColor = 'var(--diff-modified-text)';
                    borderLeft = '3px solid var(--diff-modified-border)';
                  }

                  return (
                    <Fragment key={row.originalIndex}>
                      {showDivider && (
                        <div
                          style={{
                            height: '20px',
                            minHeight: '20px',
                            maxHeight: '20px',
                            flexShrink: 0,
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            color: 'var(--text-muted)',
                            fontSize: '0.7rem',
                            fontStyle: 'italic',
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: '12px',
                            background: 'rgba(0,0,0,0.3)',
                            borderTop: '1px dashed var(--border-color)',
                            borderBottom: '1px dashed var(--border-color)',
                            opacity: 0.7,
                          }}
                        >
                          ··· {skippedCount} unchanged {skippedCount === 1 ? 'line' : 'lines'} omitted ···
                        </div>
                      )}
                      <div
                        style={{
                          backgroundColor: bg,
                          borderLeft: borderLeft,
                          height: '22px',
                          minHeight: '22px',
                          maxHeight: '22px',
                          flexShrink: 0,
                          boxSizing: 'border-box',
                          paddingLeft: '9px',
                          paddingRight: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {row.type !== 'added' ? (
                          <input
                            type="text"
                            value={row.leftContent}
                            onChange={(e) => handleEditLine(row.originalIndex, 'left', e.target.value)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: textColor,
                              fontFamily: 'inherit',
                              fontSize: 'inherit',
                              width: '100%',
                              height: '22px',
                              lineHeight: '22px',
                              outline: 'none',
                              padding: 0,
                              margin: 0,
                              boxSizing: 'border-box',
                              fontWeight: row.type !== 'unchanged' ? 500 : 400,
                            }}
                          />
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.2 }}>~</span>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>

            {/* 3: MERGE BUTTONS COLUMN (46px, Horizontal < > buttons) */}
            <div
              ref={mergeColumnRef}
              style={{
                width: '46px',
                minWidth: '46px',
                backgroundColor: 'rgba(0,0,0,0.25)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: '10px',
                borderRight: '1px solid var(--border-color)',
                userSelect: 'none',
                lineHeight: '22px',
                overflow: 'hidden',
              }}
            >
              {rowsToDisplay.map((row, displayIdx) => {
                const prevRow = displayIdx > 0 ? rowsToDisplay[displayIdx - 1] : null;
                const skippedCount = prevRow ? row.originalIndex - prevRow.originalIndex - 1 : 0;
                const showDivider = viewMode === 'diffOnly' && skippedCount > 0;

                return (
                  <Fragment key={row.originalIndex}>
                    {showDivider && (
                      <div
                        style={{
                          height: '20px',
                          minHeight: '20px',
                          maxHeight: '20px',
                          flexShrink: 0,
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          color: 'var(--text-muted)',
                          fontSize: '0.65rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(0,0,0,0.3)',
                          borderTop: '1px dashed var(--border-color)',
                          borderBottom: '1px dashed var(--border-color)',
                        }}
                      >
                        ···
                      </div>
                    )}
                    <div
                      style={{
                        height: '22px',
                        minHeight: '22px',
                        maxHeight: '22px',
                        flexShrink: 0,
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2px',
                        width: '100%',
                        flexWrap: 'nowrap',
                      }}
                    >
                      {row.type !== 'unchanged' && (
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2px', flexWrap: 'nowrap' }}>
                          {/* Copy Right to Left */}
                          {row.type !== 'removed' && (
                            <button
                              onClick={() => handleMergeLine(row.originalIndex, 'right-to-left')}
                              title="Copy Right line to Left"
                              style={{
                                border: 'none',
                                background: 'rgba(99, 102, 241, 0.2)',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                color: 'var(--diff-modified-text)',
                                width: '18px',
                                height: '18px',
                                padding: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <ChevronLeft size={13} />
                            </button>
                          )}
                          {/* Copy Left to Right */}
                          {row.type !== 'added' && (
                            <button
                              onClick={() => handleMergeLine(row.originalIndex, 'left-to-right')}
                              title="Copy Left line to Right"
                              style={{
                                border: 'none',
                                background: 'rgba(99, 102, 241, 0.2)',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                color: 'var(--diff-modified-text)',
                                width: '18px',
                                height: '18px',
                                padding: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <ChevronRight size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </Fragment>
                );
              })}
            </div>

            {/* 4 & 5: RIGHT EDITOR PANE */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* 4: Right Line Numbers (45px) */}
              <div
                ref={rightLineNumbersRef}
                style={{
                  width: '45px',
                  backgroundColor: 'rgba(0,0,0,0.15)',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  textAlign: 'right',
                  paddingRight: '8px',
                  paddingTop: '10px',
                  userSelect: 'none',
                  overflow: 'hidden',
                  lineHeight: '22px',
                }}
              >
                {rowsToDisplay.map((row, displayIdx) => {
                  const prevRow = displayIdx > 0 ? rowsToDisplay[displayIdx - 1] : null;
                  const skippedCount = prevRow ? row.originalIndex - prevRow.originalIndex - 1 : 0;
                  const showDivider = viewMode === 'diffOnly' && skippedCount > 0;

                  let numColor = 'var(--text-muted)';
                  let numBg = 'transparent';
                  if (row.type === 'added') {
                    numColor = 'var(--diff-added-text)';
                    numBg = 'rgba(16, 185, 129, 0.15)';
                  } else if (row.type === 'modified') {
                    numColor = 'var(--diff-modified-text)';
                    numBg = 'rgba(59, 130, 246, 0.15)';
                  }

                  return (
                    <Fragment key={row.originalIndex}>
                      {showDivider && (
                        <div
                          style={{
                            height: '20px',
                            minHeight: '20px',
                            maxHeight: '20px',
                            flexShrink: 0,
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            color: 'var(--text-muted)',
                            fontSize: '0.65rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(0,0,0,0.3)',
                            borderTop: '1px dashed var(--border-color)',
                            borderBottom: '1px dashed var(--border-color)',
                          }}
                        >
                          ···
                        </div>
                      )}
                      <div
                        style={{
                          height: '22px',
                          minHeight: '22px',
                          maxHeight: '22px',
                          flexShrink: 0,
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          color: numColor,
                          backgroundColor: numBg,
                          fontWeight: row.type !== 'unchanged' ? 600 : 400,
                          lineHeight: '22px',
                        }}
                      >
                        {row.type !== 'removed' ? row.rightLineNumber : ''}
                      </div>
                    </Fragment>
                  );
                })}
              </div>

              {/* 5: Right Content */}
              <div
                ref={rightPaneRef}
                onScroll={() => handleScroll('right')}
                style={{
                  flex: 1,
                  overflow: 'auto',
                  paddingTop: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  lineHeight: '22px',
                  whiteSpace: 'pre',
                }}
              >
                {rowsToDisplay.map((row, displayIdx) => {
                  const prevRow = displayIdx > 0 ? rowsToDisplay[displayIdx - 1] : null;
                  const skippedCount = prevRow ? row.originalIndex - prevRow.originalIndex - 1 : 0;
                  const showDivider = viewMode === 'diffOnly' && skippedCount > 0;

                  let bg = 'transparent';
                  let textColor = 'var(--text-primary)';
                  let borderLeft = '3px solid transparent';

                  if (row.type === 'added') {
                    bg = 'var(--diff-added-bg)';
                    textColor = 'var(--diff-added-text)';
                    borderLeft = '3px solid var(--diff-added-border)';
                  } else if (row.type === 'modified') {
                    bg = 'var(--diff-modified-bg)';
                    textColor = 'var(--diff-modified-text)';
                    borderLeft = '3px solid var(--diff-modified-border)';
                  }

                  return (
                    <Fragment key={row.originalIndex}>
                      {showDivider && (
                        <div
                          style={{
                            height: '20px',
                            minHeight: '20px',
                            maxHeight: '20px',
                            flexShrink: 0,
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            color: 'var(--text-muted)',
                            fontSize: '0.7rem',
                            fontStyle: 'italic',
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: '12px',
                            background: 'rgba(0,0,0,0.3)',
                            borderTop: '1px dashed var(--border-color)',
                            borderBottom: '1px dashed var(--border-color)',
                            opacity: 0.7,
                          }}
                        >
                          ··· {skippedCount} unchanged {skippedCount === 1 ? 'line' : 'lines'} omitted ···
                        </div>
                      )}
                      <div
                        style={{
                          backgroundColor: bg,
                          borderLeft: borderLeft,
                          height: '22px',
                          minHeight: '22px',
                          maxHeight: '22px',
                          flexShrink: 0,
                          boxSizing: 'border-box',
                          paddingLeft: '9px',
                          paddingRight: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {row.type !== 'removed' ? (
                          <input
                            type="text"
                            value={row.rightContent}
                            onChange={(e) => handleEditLine(row.originalIndex, 'right', e.target.value)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: textColor,
                              fontFamily: 'inherit',
                              fontSize: 'inherit',
                              width: '100%',
                              height: '22px',
                              lineHeight: '22px',
                              outline: 'none',
                              padding: 0,
                              margin: 0,
                              boxSizing: 'border-box',
                              fontWeight: row.type !== 'unchanged' ? 500 : 400,
                            }}
                          />
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.2 }}>~</span>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
