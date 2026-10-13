import { useState } from 'react';
import { X, GitCompare, FolderOpen, FileCode, Sparkles } from 'lucide-react';
import FolderCompare from './components/FolderCompare';
import TextCompare from './components/TextCompare';

type TabType = 'home' | 'folder' | 'text';

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
    <div style={{ background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', height: '100vh', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
      
      {/* Header / Tab bar (height: 48px) */}
      <header style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-color)', height: '48px', display: 'flex', alignItems: 'center', userSelect: 'none' }}>
        
        {/* Logo / Home Button */}
        <div
          onClick={() => setActiveTabId('home')}
          style={{
            borderColor: 'var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            gap: '8px',
            paddingLeft: '16px',
            paddingRight: '16px',
            borderRight: '1px solid var(--border-color)',
            cursor: 'pointer',
            backgroundColor: activeTabId === 'home' ? 'var(--bg-active-tab)' : 'transparent',
            borderBottom: activeTabId === 'home' ? '2px solid var(--accent-color)' : 'none',
            color: activeTabId === 'home' ? 'var(--text-primary)' : 'var(--accent-color)',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
          }}
          title="Home"
        >
          <GitCompare size={18} style={{ color: '#818cf8' }} />
          <span style={{ fontSize: '0.9rem', letterSpacing: '0.05em' }}>TINYDIFF</span>
        </div>

        {/* Tab Items (Excluding home) */}
        <div style={{ display: 'flex', height: '100%', flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
          {tabs.filter(t => t.id !== 'home').map(tab => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  backgroundColor: isActive ? 'var(--bg-active-tab)' : 'transparent',
                  borderColor: 'var(--border-color)',
                  borderRight: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: '16px',
                  paddingRight: '14px',
                  fontSize: '0.8rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderBottom: isActive ? '2px solid var(--accent-color)' : 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.type === 'folder' && <FolderOpen size={13} style={{ marginRight: '6px' }} />}
                {tab.type === 'text' && <FileCode size={13} style={{ marginRight: '6px' }} />}
                
                <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tab.title}
                </span>
                
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    marginLeft: '8px',
                    padding: '2px',
                    borderRadius: '4px',
                    color: 'var(--text-muted)',
                    opacity: 0.7,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  title="Close Tab"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          {/* New Tab Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '10px', gap: '4px' }}>
            <button
              onClick={() => addTab('folder')}
              title="New Folder Compare"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <FolderOpen size={15} />
            </button>
            <button
              onClick={() => addTab('text')}
              title="New Text Compare"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <FileCode size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        
        {/* Render Tab Contents (Keep mounted, toggle display to preserve state) */}
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
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '32px' }}>
                  <div className="glass-panel" style={{ padding: '48px', maxWidth: '600px', width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ padding: '16px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '16px', marginBottom: '24px', display: 'inline-flex', color: '#818cf8' }}>
                      <Sparkles size={40} />
                    </div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '8px', fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.02em' }}>
                      TinyDiff
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '32px', lineHeight: 1.6, maxWidth: '420px' }}>
                      High-performance Rust + Tauri v2 folder and file comparison utility. Scan directories, compare differences side-by-side, and synchronize files with precision.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', width: '100%' }}>
                      <button
                        onClick={() => addTab('folder')}
                        className="btn btn-primary"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px', gap: '12px', height: '100%' }}
                      >
                        <FolderOpen size={32} />
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Folder Compare</div>
                          <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.75)', marginTop: '4px' }}>Scan & sync directory trees</div>
                        </div>
                      </button>

                      <button
                        onClick={() => addTab('text')}
                        className="btn"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px', gap: '12px', height: '100%' }}
                      >
                        <FileCode size={32} style={{ color: '#818cf8' }} />
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Text Compare</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Line-by-line file diff & edit</div>
                        </div>
                      </button>
                    </div>
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
