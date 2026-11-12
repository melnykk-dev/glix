import React, { useEffect, useState } from 'react';
import { Play, Pause, Square, FilePlus, FolderOpen, Save, Download, Sun, Moon, Zap, Code, Move, RotateCcw, Maximize, Home, Magnet, Share, PanelLeft, PanelRight, MoreHorizontal, Puzzle, Keyboard } from 'lucide-react';
import { useSceneStore } from '../store/useSceneStore';
import { useProjectStore } from '../store/useProjectStore';
import { useEditorStore } from '../store/useEditorStore';
import { editorBridge } from '../bridge/EditorBridge';
import { saveProject, loadProject, downloadProjectV2 } from '../storage/FileIO';
import { exportProject } from '../export/Exporter';

export const Toolbar: React.FC = () => {
    const { playState } = useSceneStore();
    const { project, fileHandle, isDirty } = useProjectStore();
    const {
        setShowNewProjectDialog, theme, setTheme,
        editorMode, setEditorMode,
        gizmoMode, setGizmoMode,
        setHasEnteredEditor,
        snappingEnabled, setSnappingEnabled,
        snapSize, setSnapSize,
        mobileLeftOpen, setMobileLeftOpen,
        mobileRightOpen, setMobileRightOpen,
        setActiveRightTab,
    } = useEditorStore();
    // Mobile overflow menu (MOBILE_SPEC §1.1): at <=700px the file-op
    // group is hidden, so Open / Save / Download / Export / Extensions
    // live here instead. Desktop never shows this button.
    const [showOverflow, setShowOverflow] = useState(false);
    const openExtensionsTab = () => {
        setActiveRightTab('extensions');
        setMobileRightOpen(true);
        setMobileLeftOpen(false);
    };
    const openInputTab = () => {
        setActiveRightTab('input');
        setMobileRightOpen(true);
        setMobileLeftOpen(false);
    };

    // ── Play / Pause / Stop helpers ──────────────────────────────────────────
    const handlePlay = () => {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        if (playState === 'playing') {
            editorBridge.pause();
        } else if (playState === 'paused') {
            editorBridge.resume();
        } else {
            editorBridge.play();
        }
    };

    const handleStop = () => {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        editorBridge.stop();
    };

    const handleExport = () => {
        if (project) {
            void exportProject(project);
        }
    };

    // Download = the ONLY place a v2 .glix zip is packed (FileIO).
    // Save / Save As keep writing v1 JSON to the open file handle.
    const handleDownload = async () => {
        if (!project) return;
        try {
            const result = await downloadProjectV2();
            if (!result) return;
            const skipped = result.assetsSkipped.length;
            const notes = [
                `Downloaded ${result.fileName} (Glix v2).`,
                `${result.assetsExtracted} asset${result.assetsExtracted === 1 ? '' : 's'} packed.`,
                ...(skipped > 0 ? [`${skipped} asset${skipped === 1 ? '' : 's'} could not be carried into v2: ${result.assetsSkipped.map((s) => s.id).join(', ')}.`] : []),
                ...(result.fontsDropped.length > 0 ? [`Fonts not included: ${result.fontsDropped.join(', ')}.`] : []),
                ...(result.warnings.length > 0 ? [`Notes: ${result.warnings.slice(0, 3).join(' ')}`] : []),
            ];
            alert(notes.join('\n'));
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    };

    // ── Keyboard shortcuts wiring ────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (project) saveProject(project, fileHandle);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
                e.preventDefault();
                loadProject();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [project, fileHandle]);

    // Listen for global play/stop events fired by shortcut manager
    useEffect(() => {
        const onTogglePlay = () => handlePlay();
        const onStop = () => handleStop();
        window.addEventListener('glix-toggle-play', onTogglePlay);
        window.addEventListener('glix-stop', onStop);
        return () => {
            window.removeEventListener('glix-toggle-play', onTogglePlay);
            window.removeEventListener('glix-stop', onStop);
        };
    });  // no dep array — always use latest state

    const isPlaying = playState === 'playing';
    const isStopped = playState === 'stopped';

    return (
        <div className="glix-toolbar" style={{
            display: 'flex', alignItems: 'center', height: '100%',
            padding: '0 8px', gap: '2px',
            background: 'var(--glix-bg-deep)',
            borderBottom: '1px solid var(--glix-border)',
            position: 'relative',
        }}>
            {/* Mobile drawer toggles (desktop: hidden via CSS) */}
            <button
                className={`icon-btn tb-mobile-only${mobileLeftOpen ? ' active' : ''}`}
                onClick={() => { setMobileLeftOpen(!mobileLeftOpen); setMobileRightOpen(false); }}
                title="Toggle project panel"
            >
                <PanelLeft size={18} />
            </button>
            {/* Home / Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '12px', marginRight: '4px', borderRight: '1px solid var(--glix-border)' }}>
                <button
                    className="icon-btn"
                    onClick={() => setHasEnteredEditor(false)}
                    title="Back to Home"
                    style={{ marginRight: 4 }}
                >
                    <Home size={16} />
                </button>
                <svg width="18" height="18" viewBox="0 0 64 64">
                    <rect x="8" y="8" width="14" height="14" rx="2" fill="#E94560" />
                    <rect x="25" y="8" width="14" height="14" rx="2" fill="#E94560" />
                    <rect x="42" y="8" width="14" height="14" rx="2" fill="#E94560" />
                    <rect x="8" y="25" width="14" height="14" rx="2" fill="#E94560" />
                    <rect x="8" y="42" width="14" height="14" rx="2" fill="#E94560" />
                    <rect x="25" y="42" width="14" height="14" rx="2" fill="#533483" />
                    <rect x="42" y="42" width="14" height="14" rx="2" fill="#533483" />
                </svg>
                <span className="tb-hide-mobile" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--glix-text)', letterSpacing: '0.04em' }}>GLIX</span>
                {project && (
                    <span className="tb-hide-mobile" style={{ fontSize: '11px', color: 'var(--glix-text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.meta?.name || 'Untitled'}{isDirty ? ' ●' : ''}
                    </span>
                )}
            </div>

            {/* File ops */}
            <div className="tb-group tb-hide-mobile" style={{ display: 'flex', gap: '1px', paddingRight: '8px', marginRight: '4px', borderRight: '1px solid var(--glix-border)' }}>
                <button className="icon-btn" onClick={() => setShowNewProjectDialog(true)} title="New project (Ctrl+N)"><FilePlus size={14} /></button>
                <button className="icon-btn" onClick={() => loadProject().catch(err => alert(err.message))} title="Open .glix (Ctrl+O)"><FolderOpen size={14} /></button>
                <button className="icon-btn" onClick={() => project && saveProject(project, fileHandle)} title="Save Project (Overwrite) (Ctrl+S)" disabled={!project}>
                    <Save size={14} />
                </button>
                <button className="icon-btn" onClick={() => void handleDownload()} title="Download Project (.glix, v2 zip)" disabled={!project}>
                    <Download size={14} />
                </button>
                <button className="icon-btn" onClick={handleExport} title="Export standalone HTML game" disabled={!project}>
                    <Share size={14} />
                </button>
            </div>

            {/* Editor mode */}
            <div className="tb-group tb-hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: '8px', marginRight: '4px', borderRight: '1px solid var(--glix-border)' }}>
                <button
                    className={`icon-btn ${editorMode === 'starter' ? 'active' : ''}`}
                    onClick={() => setEditorMode('starter')}
                    title="Starter Mode — Logic Blocks"
                >
                    <Zap size={14} />
                </button>
                <button
                    className={`icon-btn ${editorMode === 'advanced' ? 'active' : ''}`}
                    onClick={() => setEditorMode('advanced')}
                    title="Advanced Mode — Script Editor"
                >
                    <Code size={14} />
                </button>
            </div>

            {/* Snap Settings */}
            <div className="tb-group tb-hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: '8px', marginRight: '4px', borderRight: '1px solid var(--glix-border)' }}>
                <button
                    className={`icon-btn ${snappingEnabled ? 'active' : ''}`}
                    onClick={() => setSnappingEnabled(!snappingEnabled)}
                    title="Toggle Grid Snapping"
                >
                    <Magnet size={14} />
                </button>
                <select
                    value={snapSize}
                    onChange={(e) => setSnapSize(Number(e.target.value))}
                    style={{
                        background: 'transparent', border: 'none', color: 'var(--glix-text-muted)',
                        fontSize: '10px', outline: 'none', cursor: 'pointer',
                        width: '45px'
                    }}
                >
                    <option value={0.1}>0.1</option>
                    <option value={0.25}>0.25</option>
                    <option value={0.5}>0.5</option>
                    <option value={1}>1.0</option>
                    <option value={2}>2.0</option>
                </select>
            </div>

            {/* Playback controls — centred */}
            <div className="tb-playback" style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--glix-bg)',
                padding: '2px 10px',
                borderRadius: '8px',
                border: `1px solid ${isPlaying ? 'var(--glix-accent)' : 'var(--glix-border-md)'}`,
                transition: 'border-color 0.2s',
            }}>
                <button
                    className={`icon-btn ${!isStopped ? 'active' : ''}`}
                    onClick={handlePlay}
                    title={isPlaying ? 'Pause (Ctrl+P)' : 'Play (Ctrl+P)'}
                    style={{ color: isPlaying ? 'var(--glix-accent)' : undefined }}
                >
                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </button>
                <button
                    className="icon-btn"
                    onClick={handleStop}
                    disabled={isStopped}
                    title="Stop (Esc)"
                >
                    <Square size={16} fill="currentColor" />
                </button>
            </div>

            {/* Right side */}
            <div className="tb-group tb-hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
                {/* Gizmo mode */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                        className={`icon-btn ${gizmoMode === 'translate' ? 'active' : ''}`}
                        onClick={() => setGizmoMode('translate')}
                        title="Move (G)"
                    >
                        <Move size={16} />
                    </button>
                    <button
                        className={`icon-btn ${gizmoMode === 'rotate' ? 'active' : ''}`}
                        onClick={() => setGizmoMode('rotate')}
                        title="Rotate (R)"
                    >
                        <RotateCcw size={16} />
                    </button>
                    <button
                        className={`icon-btn ${gizmoMode === 'scale' ? 'active' : ''}`}
                        onClick={() => setGizmoMode('scale')}
                        title="Scale (S)"
                    >
                        <Maximize size={16} />
                    </button>
                </div>

                <div style={{ width: 1, height: 20, background: 'var(--glix-border)' }} />

                <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">
                    {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                </button>
                <span style={{ fontSize: '9px', color: 'var(--glix-text-dim)', padding: '0 6px' }}>v0.1.0</span>
            </div>

            {/* Mobile overflow menu: file ops are hidden at <=700px, so they
                live here (MOBILE_SPEC §1.1). Desktop never shows this. */}
            <div style={{ position: 'relative' }} className="tb-mobile-only">
                <button
                    className="icon-btn"
                    onClick={() => setShowOverflow(!showOverflow)}
                    title="More actions"
                    aria-label="More actions"
                    aria-pressed={showOverflow}
                    aria-expanded={showOverflow}
                    // Above the menu's own dismiss overlay (z-index 99) so
                    // the button stays the toggle — tap it again to close.
                    style={{ position: 'relative', zIndex: 100 }}
                >
                    <MoreHorizontal size={18} />
                </button>
                {showOverflow && (
                    <>
                        <div
                            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                            onClick={() => setShowOverflow(false)}
                            aria-hidden
                        />
                        <div
                            role="menu"
                            style={{
                                position: 'absolute', right: 0, top: 44, zIndex: 100,
                                minWidth: 220, padding: 6, borderRadius: 8,
                                background: 'var(--glix-bg-alt)',
                                border: '1px solid var(--glix-border-md)',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                            }}
                        >
                            {([
                                { label: 'Open .glix file', icon: <FolderOpen size={15} />, title: 'Open .glix (Ctrl+O)', run: () => { void loadProject().catch((err: Error) => alert(err.message)); } },
                                { label: 'Save', icon: <Save size={15} />, title: 'Save Project (Overwrite) (Ctrl+S)', run: () => { if (project) saveProject(project, fileHandle); } },
                                { label: 'Download .glix (v2 zip)', icon: <Download size={15} />, title: 'Download Project (.glix, v2 zip)', run: () => { void handleDownload(); } },
                                { label: 'Export standalone HTML', icon: <Share size={15} />, title: 'Export standalone HTML game', run: () => handleExport() },
                                { label: 'Extensions', icon: <Puzzle size={15} />, title: 'Extensions', run: () => openExtensionsTab() },
                                { label: 'Input rebinding', icon: <Keyboard size={15} />, title: 'Input rebinding', run: () => openInputTab() },
                                { label: theme === 'dark' ? 'Light theme' : 'Dark theme', icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />, title: 'Toggle theme', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
                            ] as const).map(item => (
                                <button
                                    key={item.label}
                                    role="menuitem"
                                    title={item.title}
                                    onClick={() => { setShowOverflow(false); item.run(); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                        minHeight: 44, padding: '0 10px', borderRadius: 6,
                                        background: 'transparent', border: 'none',
                                        color: 'var(--glix-text)', fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', textAlign: 'left',
                                    }}
                                >
                                    <span style={{ color: 'var(--glix-accent)', display: 'flex' }}>{item.icon}</span>
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Mobile drawer toggle (right) — desktop: hidden via CSS */}
            <button
                className={`icon-btn tb-mobile-only tb-mobile-right${mobileRightOpen ? ' active' : ''}`}
                onClick={() => { setMobileRightOpen(!mobileRightOpen); setMobileLeftOpen(false); }}
                title="Toggle inspector panel"
            >
                <PanelRight size={18} />
            </button>
        </div>
    );
};
