import React, { useEffect } from 'react';
import { Play, Pause, Square, FilePlus, FolderOpen, Save, Download, Sun, Moon, Zap, Code, Move, RotateCcw, Maximize } from 'lucide-react';
import { useSceneStore } from '../store/useSceneStore';
import { useProjectStore } from '../store/useProjectStore';
import { useEditorStore } from '../store/useEditorStore';
import { editorBridge } from '../bridge/EditorBridge';
import { saveProject, loadProject } from '../storage/FileIO';
import { exportProject } from '../export/Exporter';

export const Toolbar: React.FC = () => {
    const { playState } = useSceneStore();
    const { project, fileHandle, isDirty } = useProjectStore();
    const { setShowNewProjectDialog, theme, setTheme, editorMode, setEditorMode, gizmoMode, setGizmoMode } = useEditorStore();

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
        <div style={{
            display: 'flex', alignItems: 'center', height: '100%',
            padding: '0 8px', gap: '2px',
            background: 'var(--glix-bg-deep)',
            borderBottom: '1px solid var(--glix-border)',
        }}>
            {/* Logo / name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '12px', marginRight: '4px', borderRight: '1px solid var(--glix-border)' }}>
                <svg width="18" height="18" viewBox="0 0 64 64">
                    <rect x="8" y="8" width="14" height="14" rx="2" fill="#E94560" />
                    <rect x="25" y="8" width="14" height="14" rx="2" fill="#E94560" />
                    <rect x="42" y="8" width="14" height="14" rx="2" fill="#E94560" />
                    <rect x="8" y="25" width="14" height="14" rx="2" fill="#E94560" />
                    <rect x="8" y="42" width="14" height="14" rx="2" fill="#E94560" />
                    <rect x="25" y="42" width="14" height="14" rx="2" fill="#533483" />
                    <rect x="42" y="42" width="14" height="14" rx="2" fill="#533483" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--glix-text)', letterSpacing: '0.04em' }}>GLIX</span>
                {project && (
                    <span style={{ fontSize: '11px', color: 'var(--glix-text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.meta?.name || 'Untitled'}{isDirty ? ' ●' : ''}
                    </span>
                )}
            </div>

            {/* File ops */}
            <div style={{ display: 'flex', gap: '1px', paddingRight: '8px', marginRight: '4px', borderRight: '1px solid var(--glix-border)' }}>
                <button className="icon-btn" onClick={() => setShowNewProjectDialog(true)} title="New project (Ctrl+N)"><FilePlus size={14} /></button>
                <button className="icon-btn" onClick={() => loadProject()} title="Open .glix (Ctrl+O)"><FolderOpen size={14} /></button>
                <button className="icon-btn" onClick={() => project && saveProject(project, fileHandle)} title="Save (Ctrl+S)" disabled={!project}>
                    <Save size={14} />
                </button>
                <button className="icon-btn" onClick={() => project && exportProject(project)} title="Export as HTML" disabled={!project}>
                    <Download size={14} />
                </button>
            </div>

            {/* Editor mode */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: '8px', marginRight: '4px', borderRight: '1px solid var(--glix-border)' }}>
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

            {/* Playback controls — centred */}
            <div style={{
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
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
        </div>
    );
};
