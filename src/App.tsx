import { useState } from 'react';
import { X, GitCompare, FolderOpen, FileCode } from 'lucide-react';
import FolderCompare from './components/FolderCompare';
import TextCompare from './components/TextCompare';

type TabType = 'home' | 'folder' | 'text';

const tabStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  padding: '0 8px 0 12px',
  fontSize: '0.8rem',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  borderRight: '1px solid var(--border-color)',
  borderTop: isActive ? '1px solid var(--accent-color)' : '1px solid transparent',
  marginBottom: isActive ? '-1px' : 0,
  background: isActive ? 'var(--bg-active-tab)' : 'transparent',
  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
});

interface Tab {
  id: string;
  title: string;
  type: TabType;
  leftPath?: string;
  rightPath?: string;
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'home', title: 'Home', type: 'home' }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('home');

  const addTab = (type: TabType, leftPath?: string, rightPath?: string) => {
    const id = `${type}-${Date.now()}`;
    const title = type === 'folder' ? 'Folder Compare' : 'Text Compare';
    const newTab: Tab = { id, title, type, leftPath, rightPath };
    setTabs([...tabs, newTab]);
    setActiveTabId(id);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (id === 'home') return; // Keep home open

    const index = tabs.findIndex(t => t.id === id);
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);

    if (activeTabId === id) {
      const nextActiveIndex = Math.max(0, index - 1);
      setActiveTabId(newTabs[nextActiveIndex]?.id || 'home');
    }
  };

  const updateTabTitle = (id: string, newTitle: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, title: newTitle } : t));
  };

  return (
    <div style={{ background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', height: '100vh', color: 'var(--text-primary)' }}>

      {/* Tab bar */}
      <header style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-color)', height: '34px', display: 'flex', alignItems: 'stretch', userSelect: 'none' }}>
        <div
          onClick={() => setActiveTabId('home')}
          className={`tab ${activeTabId === 'home' ? 'is-active' : ''}`}
          style={tabStyle(activeTabId === 'home')}
          title="Start"
        >
          <GitCompare size={14} style={{ marginRight: '6px', color: 'var(--text-secondary)' }} />
          <span>TinyDiff</span>
        </div>

        <div style={{ display: 'flex', flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
          {tabs.filter(t => t.id !== 'home').map(tab => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`tab ${isActive ? 'is-active' : ''}`}
                style={tabStyle(isActive)}
              >
                {tab.type === 'folder' && <FolderOpen size={13} style={{ marginRight: '6px', flexShrink: 0 }} />}
                {tab.type === 'text' && <FileCode size={13} style={{ marginRight: '6px', flexShrink: 0 }} />}

                <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tab.title}
                </span>

                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  className="icon-btn tab-close"
                  style={{ marginLeft: '6px', padding: '2px' }}
                  title="Close"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '4px', gap: '2px' }}>
            <button onClick={() => addTab('folder')} className="icon-btn" title="New Folder Compare">
              <FolderOpen size={14} />
            </button>
            <button onClick={() => addTab('text')} className="icon-btn" title="New Text Compare">
              <FileCode size={14} />
            </button>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* Keep every tab mounted and toggle display so state survives tab switches */}
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              style={{
                display: isActive ? 'block' : 'none',
                height: '100%',
                width: '100%'
              }}
            >
              {tab.type === 'home' && (
                <div style={{ padding: '40px 48px', maxWidth: '560px' }}>
                  <h1 style={{ fontSize: '1.4rem', fontWeight: 400, marginBottom: '4px' }}>TinyDiff</h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '28px' }}>
                    Compare folders and files side by side.
                  </p>

                  <h2 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Start</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '-8px' }}>
                    <button className="start-link" onClick={() => addTab('folder')}>
                      <FolderOpen size={16} />
                      <span>Folder Compare</span>
                      <span className="start-link-desc">Two directories, copy and delete between them</span>
                    </button>
                    <button className="start-link" onClick={() => addTab('text')}>
                      <FileCode size={16} />
                      <span>Text Compare</span>
                      <span className="start-link-desc">Two files, line by line, editable</span>
                    </button>
                  </div>
                </div>
              )}

              {tab.type === 'folder' && (
                <FolderCompare
                  initialLeftPath={tab.leftPath}
                  initialRightPath={tab.rightPath}
                  onOpenTextCompare={(left, right) => {
                    addTab('text', left, right);
                  }}
                  updateTitle={(title) => updateTabTitle(tab.id, title)}
                />
              )}

              {tab.type === 'text' && (
                <TextCompare
                  initialLeftPath={tab.leftPath}
                  initialRightPath={tab.rightPath}
                  updateTitle={(title) => updateTabTitle(tab.id, title)}
                />
              )}
            </div>
          );
        })}

      </main>
    </div>
  );
}
