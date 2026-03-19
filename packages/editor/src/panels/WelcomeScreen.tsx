import React from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { clearAutoSave } from '../storage/AutoSave';
import { loadProject } from '../storage/FileIO';
import { FolderOpen, Zap, Box, ArrowUpRight } from 'lucide-react';

import emptyTemplate from '../templates/empty.glix?raw';
import platformerTemplate from '../templates/platformer.glix?raw';
import topdownTemplate from '../templates/topdown.glix?raw';

interface Props { onClose: () => void; }

const TEMPLATES = [
    { id: 'empty',      label: 'Empty project',   desc: 'Blank scene, start fresh',        raw: emptyTemplate },
    { id: 'platformer', label: 'Platformer',       desc: 'Player, physics, jump & run',     raw: platformerTemplate },
    { id: 'topdown',    label: 'Top-down',         desc: 'WASD movement, collision walls',  raw: topdownTemplate },
];

export const WelcomeScreen: React.FC<Props> = ({ onClose }) => {
    const { setProject, setFileHandle, markDirty } = useProjectStore();

    const loadTemplate = async (raw: string) => {
        try {
            const projectData = JSON.parse(raw);
            await clearAutoSave();
            setFileHandle(null);
            setProject(projectData);
            markDirty();
            onClose();
        } catch (e) {
            console.error('Failed to load template', e);
            onClose();
        }
    };

    return (
        <div className="dialog-overlay">
            <div style={{
                background: 'var(--glix-bg)',
                border: '1px solid var(--glix-border-hi)',
                borderRadius: 12,
                padding: 0,
                maxWidth: 560,
                width: '92%',
                overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{ background: 'var(--glix-bg-deep)', padding: '24px 28px', borderBottom: '1px solid var(--glix-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <svg width="32" height="32" viewBox="0 0 64 64">
                            <rect x="8"  y="8"  width="14" height="14" rx="2" fill="#E94560" />
                            <rect x="25" y="8"  width="14" height="14" rx="2" fill="#E94560" />
                            <rect x="42" y="8"  width="14" height="14" rx="2" fill="#E94560" />
                            <rect x="8"  y="25" width="14" height="14" rx="2" fill="#E94560" />
                            <rect x="8"  y="42" width="14" height="14" rx="2" fill="#E94560" />
                            <rect x="25" y="42" width="14" height="14" rx="2" fill="#533483" />
                            <rect x="42" y="42" width="14" height="14" rx="2" fill="#533483" />
                        </svg>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--glix-text)', letterSpacing: '-0.01em' }}>Welcome to Glix</div>
                            <div style={{ fontSize: 12, color: 'var(--glix-text-muted)', marginTop: 2 }}>Local-first 2D game engine for the browser</div>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 28px 24px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--glix-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                        Start from a template
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                        {TEMPLATES.map(t => (
                            <button
                                key={t.id}
                                onClick={() => loadTemplate(t.raw)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 14px', borderRadius: 6,
                                    background: 'var(--glix-bg-deep)',
                                    border: '1px solid var(--glix-border)',
                                    color: 'var(--glix-text)', cursor: 'pointer',
                                    textAlign: 'left', transition: 'border-color 0.15s',
                                    width: '100%',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--glix-accent)')}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--glix-border)')}
                            >
                                <Zap size={14} style={{ color: 'var(--glix-accent)', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700 }}>{t.label}</div>
                                    <div style={{ fontSize: 10, color: 'var(--glix-text-muted)', marginTop: 1 }}>{t.desc}</div>
                                </div>
                                <ArrowUpRight size={12} style={{ marginLeft: 'auto', color: 'var(--glix-text-dim)' }} />
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => { loadProject(); onClose(); }}
                            style={{
                                flex: 1, padding: '10px', fontSize: 12, fontWeight: 700,
                                background: 'transparent', border: '1px solid var(--glix-border-md)',
                                color: 'var(--glix-text-muted)', borderRadius: 6, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                                transition: 'border-color 0.15s, color 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--glix-text-muted)'; e.currentTarget.style.color = 'var(--glix-text)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glix-border-md)'; e.currentTarget.style.color = 'var(--glix-text-muted)'; }}
                        >
                            <FolderOpen size={13} /> Open .glix file
                        </button>
                        <button
                            onClick={() => loadTemplate(emptyTemplate)}
                            style={{
                                flex: 1, padding: '10px', fontSize: 12, fontWeight: 700,
                                background: 'var(--glix-accent)', border: 'none',
                                color: '#fff', borderRadius: 6, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                            }}
                        >
                            <Box size={13} /> Start empty
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
