import React from 'react';
import { Layout } from './components/Layout';
import { Hierarchy } from './panels/Hierarchy';
import { Viewport } from './panels/Viewport';
import { Inspector } from './panels/Inspector';
import { PostProcessSettings } from './panels/PostProcessSettings';
import { AssetBrowser } from './panels/AssetBrowser';
import { ScriptEditor } from './panels/ScriptEditor';
import { TilemapEditor } from './panels/TilemapEditor';
import { ProjectSettings } from './panels/ProjectSettings';
import { Profiler } from './panels/Profiler';
import { BehaviorLibrary } from './panels/BehaviorLibrary';
import { Toolbar } from './components/Toolbar';
import { AnimationPlayerPanel } from './panels/AnimationPlayerPanel';
import { ExtensionsPanel } from './panels/ExtensionsPanel';
import { MobileControllerPanel } from './panels/MobileControllerPanel';
import InputRebindingPanel from './panels/InputRebindingPanel';
import type { InputMapConfigV2 } from '@glix/runtime/src/input/InputMap';
import { useEditorStore } from './store/useEditorStore';
import { useProjectStore } from './store/useProjectStore';
import { RestoreDialog } from './dialogs/RestoreDialog';
import { NewProjectDialog } from './dialogs/NewProjectDialog';
import { WelcomeScreen } from './panels/WelcomeScreen';
import { ShortcutsDialog } from './panels/ShortcutsDialog';
import { Move, RotateCcw, Maximize2, Monitor } from 'lucide-react';
import { CommandPalette } from './components/CommandPalette';
import { HomePage } from './components/HomePage';
import { RuntimeErrorToast } from './components/RuntimeErrorToast';
import './index.css';
import './mobile.css';

const App: React.FC = () => {
    const {
        activeRightTab, setActiveRightTab,
        showNewProjectDialog, setShowNewProjectDialog,
        theme, setTheme,
        showShortcuts, setShowShortcuts,
        hasSeenWelcome, setHasSeenWelcome,
        hasEnteredEditor,
        gizmoMode, setGizmoMode,
        editorMode,
        mobileLeftOpen, setMobileLeftOpen,
        mobileRightOpen, setMobileRightOpen,
    } = useEditorStore();

    React.useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    React.useEffect(() => {
        const onToggle = () => setShowShortcuts(!showShortcuts);
        window.addEventListener('glix-toggle-shortcuts', onToggle);
        return () => window.removeEventListener('glix-toggle-shortcuts', onToggle);
    }, [showShortcuts, setShowShortcuts]);

    // Mobile drawers: reflect open state on <body> so CSS can slide panels in.
    React.useEffect(() => {
        document.body.classList.toggle('glix-left-open', mobileLeftOpen);
        document.body.classList.toggle('glix-right-open', mobileRightOpen);
    }, [mobileLeftOpen, mobileRightOpen]);

    const closeDrawers = () => { setMobileLeftOpen(false); setMobileRightOpen(false); };

    // Input rebinding persistence: the panel edits the live engine's
    // InputMap immediately; this writes the keyboard bindings back into
    // the project (v1 model holds keyboard codes only — touch/gamepad
    // bindings live in the engine only, same limitation as FileIO's
    // v2→v1 conversion, and are lost on v2 download until the editor
    // moves to a v2 in-memory model).
    const handleInputConfigChange = (config: InputMapConfigV2) => {
        const input: Record<string, string[]> = {};
        for (const [action, def] of Object.entries(config.actions)) {
            const codes = def.bindings
                .filter((b) => b.device === 'keyboard')
                .map((b) => (b as { code: string }).code);
            if (codes.length > 0) input[action] = codes;
        }
        useProjectStore.getState().updateProject((p) => ({
            ...p,
            settings: { ...p.settings, input },
        }));
    };

    // Broken-assets banner (FileIO v2): shown when the opened file had
    // assets that could not be loaded. Dismiss resets per opened file.
    const { brokenAssets, fileWarnings } = useProjectStore();
    const bannerKey = `${brokenAssets.join(',')}|${fileWarnings.length}`;
    const [dismissedBanner, setDismissedBanner] = React.useState('');
    const showBanner = brokenAssets.length > 0 && dismissedBanner !== bannerKey;

    if (!hasEnteredEditor) {
        return <HomePage />;
    }

    return (
        <div className="glix-editor" style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <CommandPalette />
            <RuntimeErrorToast />
            {!hasSeenWelcome && <WelcomeScreen onClose={() => setHasSeenWelcome(true)} />}
            {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
            <RestoreDialog />
            {showNewProjectDialog && <NewProjectDialog onClose={() => setShowNewProjectDialog(false)} />}
            {(mobileLeftOpen || mobileRightOpen) && (
                <div className="glix-drawer-scrim" onClick={closeDrawers} />
            )}
            {showBanner && (
                <div
                    role="alert"
                    style={{
                        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', fontSize: 12,
                        background: 'rgba(233, 69, 96, 0.12)',
                        borderBottom: '1px solid rgba(233, 69, 96, 0.4)',
                        color: 'var(--glix-text)',
                    }}
                >
                    <span style={{ flex: 1 }}>
                        {brokenAssets.length} asset{brokenAssets.length === 1 ? '' : 's'} could not be loaded
                        ({brokenAssets.slice(0, 3).join(', ')}{brokenAssets.length > 3 ? `, +${brokenAssets.length - 3} more` : ''})
                        — {brokenAssets.length === 1 ? 'it shows' : 'they show'} as a placeholder.
                        {fileWarnings.length > 0 && ` ${fileWarnings.length} note${fileWarnings.length === 1 ? '' : 's'} from opening this file.`}
                    </span>
                    <button
                        className="icon-btn"
                        style={{ minWidth: 44, minHeight: 32 }}
                        onClick={() => setDismissedBanner(bannerKey)}
                        title="Dismiss"
                    >
                        ✕
                    </button>
                </div>
            )}
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <Layout
                top={<Toolbar />}
                left={
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        {/* Gizmo mode */}
                        <div style={{ display: 'flex', gap: 2, padding: '5px 8px', borderBottom: '1px solid var(--glix-border)', background: 'var(--glix-bg-deep)' }}>
                            {([
                                { mode: 'translate', Icon: Move, title: 'Translate (G)' },
                                { mode: 'rotate', Icon: RotateCcw, title: 'Rotate (R)' },
                                { mode: 'scale', Icon: Maximize2, title: 'Scale (S)' },
                            ] as const).map(({ mode, Icon, title }) => (
                                <button
                                    key={mode}
                                    className={`icon-btn${gizmoMode === mode ? ' active' : ''}`}
                                    style={{
                                        flex: 1, padding: '5px 0', borderRadius: 4,
                                        background: gizmoMode === mode ? 'var(--glix-select-bg)' : 'transparent'
                                    }}
                                    onClick={() => setGizmoMode(mode)}
                                    title={title}
                                >
                                    <Icon size={12} />
                                </button>
                            ))}
                        </div>

                        {/* Hierarchy */}
                        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                            <Hierarchy />
                        </div>

                        {/* Asset browser */}
                        <div style={{ height: '35%', minHeight: 100, borderTop: '1px solid var(--glix-border)', overflow: 'hidden' }}>
                            <AssetBrowser />
                        </div>

                        {/* Footer */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderTop: '1px solid var(--glix-border)', background: 'var(--glix-bg-deep)' }}>
                            <div style={{ flex: 1 }} />
                            <span
                                style={{ fontSize: 9, color: 'var(--glix-text-dim)', cursor: 'pointer' }}
                                onClick={() => setShowShortcuts(true)}
                            >
                                ? shortcuts
                            </span>
                        </div>
                    </div>
                }
                center={<Viewport />}
                right={
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div className="tab-bar">
                            {(['inspector', 'logic', 'render', 'script', 'tilemap', 'project', 'profiler', 'animation', 'extensions', 'mobile-controller', 'input'] as const)
                                .filter(tab => editorMode === 'advanced' || ['inspector', 'logic', 'tilemap', 'project', 'animation', 'extensions', 'mobile-controller', 'input'].includes(tab))
                                .map(tab => (
                                    <button
                                        key={tab}
                                        className={`tab-btn${activeRightTab === tab ? ' active' : ''}`}
                                        onClick={() => setActiveRightTab(tab as any)}
                                    >
                                        {tab === 'logic' ? 'Blocks'
                                            : tab === 'render' ? <><Monitor size={10} style={{ marginRight: 3 }} />Render</>
                                                : tab === 'animation' ? 'Animation'
                                                    : tab === 'extensions' ? 'Extensions'
                                                        : tab === 'mobile-controller' ? 'Controller'
                                                            : tab === 'input' ? 'Input'
                                                                : tab}
                                    </button>
                                ))}
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                            {activeRightTab === 'inspector' && <Inspector />}
                            {activeRightTab === 'logic' && <BehaviorLibrary />}
                            {activeRightTab === 'render' && <PostProcessSettings />}
                            {activeRightTab === 'script' && <ScriptEditor />}
                            {activeRightTab === 'tilemap' && <TilemapEditor />}
                            {activeRightTab === 'project' && <ProjectSettings />}
                            {activeRightTab === 'profiler' && <Profiler />}
                            {activeRightTab === 'animation' && <AnimationPlayerPanel />}
                            {activeRightTab === 'extensions' && <ExtensionsPanel />}
                            {activeRightTab === 'mobile-controller' && <MobileControllerPanel />}
                            {activeRightTab === 'input' && <InputRebindingPanel onConfigChange={handleInputConfigChange} />}
                        </div>
                    </div>
                }
            />
            </div>
        </div>
    );
};

export default App;
