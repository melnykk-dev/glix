import React from 'react';
import { Layout } from './components/Layout';
import { Hierarchy } from './panels/Hierarchy';
import { Viewport } from './panels/Viewport';
import { Inspector } from './panels/Inspector';
import { AssetBrowser } from './panels/AssetBrowser';
import { ScriptEditor } from './panels/ScriptEditor';
import { TilemapEditor } from './panels/TilemapEditor';
import { ProjectSettings } from './panels/ProjectSettings';
import { Profiler } from './panels/Profiler';
import { Toolbar } from './components/Toolbar';
import { useEditorStore } from './store/useEditorStore';
import { RestoreDialog } from './dialogs/RestoreDialog';
import { NewProjectDialog } from './dialogs/NewProjectDialog';
import { WelcomeScreen } from './panels/WelcomeScreen';
import { ShortcutsDialog } from './panels/ShortcutsDialog';
import { Move, RotateCcw, Maximize2, BarChart2 } from 'lucide-react';
import './index.css';

const App: React.FC = () => {
    const {
        activeRightTab, setActiveRightTab,
        showNewProjectDialog, setShowNewProjectDialog,
        theme, setTheme,
        showShortcuts, setShowShortcuts,
        hasSeenWelcome, setHasSeenWelcome,
        gizmoMode, setGizmoMode,
    } = useEditorStore();

    React.useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    React.useEffect(() => {
        const onToggle = () => setShowShortcuts(!showShortcuts);
        window.addEventListener('glix-toggle-shortcuts', onToggle);
        return () => window.removeEventListener('glix-toggle-shortcuts', onToggle);
    }, [showShortcuts, setShowShortcuts]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {!hasSeenWelcome && <WelcomeScreen onClose={() => setHasSeenWelcome(true)} />}
            {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
            <RestoreDialog />
            {showNewProjectDialog && <NewProjectDialog onClose={() => setShowNewProjectDialog(false)} />}

            <Layout
                top={<Toolbar />}
                left={
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        {/* Gizmo mode */}
                        <div style={{ display: 'flex', gap: 2, padding: '5px 8px', borderBottom: '1px solid var(--glix-border)', background: 'var(--glix-bg-deep)' }}>
                            {([
                                { mode: 'translate', Icon: Move,      title: 'Translate (G)' },
                                { mode: 'rotate',    Icon: RotateCcw,  title: 'Rotate (R)'    },
                                { mode: 'scale',     Icon: Maximize2,  title: 'Scale (S)'     },
                            ] as const).map(({ mode, Icon, title }) => (
                                <button
                                    key={mode}
                                    className={`icon-btn${gizmoMode === mode ? ' active' : ''}`}
                                    style={{ flex: 1, padding: '5px 0', borderRadius: 4,
                                        background: gizmoMode === mode ? 'var(--glix-select-bg)' : 'transparent' }}
                                    onClick={() => setGizmoMode(mode)}
                                    title={title}
                                >
                                    <Icon size={12}/>
                                </button>
                            ))}
                        </div>

                        {/* Hierarchy takes most space */}
                        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                            <Hierarchy />
                        </div>

                        {/* Asset browser at bottom */}
                        <div style={{ height: '35%', minHeight: 100, borderTop: '1px solid var(--glix-border)', overflow: 'hidden' }}>
                            <AssetBrowser />
                        </div>

                        {/* Footer row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderTop: '1px solid var(--glix-border)', background: 'var(--glix-bg-deep)' }}>
                            <button
                                className={`icon-btn`}
                                style={{ fontSize: 9, gap: 4, display: 'flex', alignItems: 'center', color: 'var(--glix-text-dim)' }}
                                onClick={() => setShowShortcuts(true)}
                                title="Keyboard shortcuts (?)"
                            >
                                <BarChart2 size={11}/> Profiler
                            </button>
                            <div style={{ flex: 1 }}/>
                            <span style={{ fontSize: 9, color: 'var(--glix-text-dim)' }}>? shortcuts</span>
                        </div>
                    </div>
                }
                center={<Viewport />}
                right={
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div className="tab-bar">
                            {(['inspector', 'script', 'tilemap', 'project'] as const).map(tab => (
                                <button
                                    key={tab}
                                    className={`tab-btn${activeRightTab === tab ? ' active' : ''}`}
                                    onClick={() => setActiveRightTab(tab)}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                            {activeRightTab === 'inspector' && <Inspector />}
                            {activeRightTab === 'script'    && <ScriptEditor />}
                            {activeRightTab === 'tilemap'   && <TilemapEditor />}
                            {activeRightTab === 'project'   && <ProjectSettings />}
                        </div>
                    </div>
                }
            />
        </div>
    );
};

export default App;
