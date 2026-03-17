import React, { useEffect } from 'react';
import { Play, Pause, Square, FilePlus, FolderOpen, Save, Download, Sun, Moon } from 'lucide-react';
import { useSceneStore } from '../store/useSceneStore';
import { useProjectStore } from '../store/useProjectStore';
import { useEditorStore } from '../store/useEditorStore';
import { editorBridge } from '../bridge/EditorBridge';
import { saveProject, loadProject } from '../storage/FileIO';
import { exportProject } from '../export/Exporter';

export const Toolbar: React.FC = () => {
    const { playState } = useSceneStore();
    const { project, fileHandle, isDirty } = useProjectStore();
    const { setShowNewProjectDialog, theme, setTheme } = useEditorStore();

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

    const isPlaying = playState === 'playing';
    const isPaused  = playState === 'paused';
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
                    <rect x="8"  y="8"  width="14" height="14" rx="2" fill="#E94560"/>
                    <rect x="25" y="8"  width="14" height="14" rx="2" fill="#E94560"/>
                    <rect x="42" y="8"  width="14" height="14" rx="2" fill="#E94560"/>
                    <rect x="8"  y="25" width="14" height="14" rx="2" fill="#E94560"/>
                    <rect x="8"  y="42" width="14" height="14" rx="2" fill="#E94560"/>
                    <rect x="25" y="42" width="14" height="14" rx="2" fill="#533483"/>
                    <rect x="42" y="42" width="14" height="14" rx="2" fill="#533483"/>
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--glix-text)', letterSpacing: '0.04em' }}>GLIX</span>
                {project && (
                    <span style={{ fontSize: '11px', color: 'var(--glix-text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.meta.name}{isDirty ? ' ●' : ''}
                    </span>
                )}
            </div>

            {/* File ops */}
            <div style={{ display: 'flex', gap: '1px', paddingRight: '8px', marginRight: '4px', borderRight: '1px solid var(--glix-border)' }}>
                <button className="icon-btn" onClick={() => setShowNewProjectDialog(true)} title="New (Ctrl+N)"><FilePlus size={14}/></button>
                <button className="icon-btn" onClick={() => loadProject()} title="Open (Ctrl+O)"><FolderOpen size={14}/></button>
                <button className={`icon-btn${isDirty ? ' active' : ''}`} onClick={() => project && saveProject(project, fileHandle)} title="Save (Ctrl+S)"><Save size={14}/></button>
                <button className="icon-btn" onClick={() => project && exportProject(project)} title="Export HTML"><Download size={14}/></button>
            </div>

            {/* Play controls */}
            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                {!isPlaying ? (
                    <button
                        className="icon-btn"
                        style={{ color: '#4cff91', padding: '4px 10px' }}
                        onClick={() => isPaused ? editorBridge.resume() : editorBridge.play()}
                        title="Play"
                    >
                        <Play size={14} fill="currentColor"/>
                    </button>
                ) : (
                    <button
                        className="icon-btn"
                        style={{ color: 'var(--glix-warn)', padding: '4px 10px' }}
                        onClick={() => editorBridge.pause()}
                        title="Pause"
                    >
                        <Pause size={14} fill="currentColor"/>
                    </button>
                )}
                <button
                    className="icon-btn danger"
                    style={{ color: isStopped ? 'var(--glix-text-dim)' : '#ff5555', padding: '4px 8px' }}
                    onClick={() => editorBridge.stop()}
                    disabled={isStopped}
                    title="Stop"
                >
                    <Square size={13} fill="currentColor"/>
                </button>

                {isPlaying && (
                    <span style={{ fontSize: '9px', color: '#4cff91', letterSpacing: '0.08em', marginLeft: 4 }}>LIVE</span>
                )}
                {isPaused && (
                    <span style={{ fontSize: '9px', color: 'var(--glix-warn)', letterSpacing: '0.08em', marginLeft: 4 }}>PAUSED</span>
                )}
            </div>

            <div style={{ flex: 1 }}/>

            {/* Theme toggle */}
            <button
                className="icon-btn"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Toggle theme"
            >
                {theme === 'dark' ? <Sun size={13}/> : <Moon size={13}/>}
            </button>

            <span style={{ fontSize: '9px', color: 'var(--glix-text-dim)', padding: '0 6px' }}>v0.1.0</span>
        </div>
    );
};
