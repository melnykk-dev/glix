import React from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { clearAutoSave } from '../storage/AutoSave';
import { Zap, ArrowUpRight } from 'lucide-react';

import emptyTemplate from '../templates/empty.glix?raw';
import platformerTemplate from '../templates/platformer.glix?raw';
import topdownTemplate from '../templates/topdown.glix?raw';
import spaceShooterTemplate from '../templates/space_shooter.glix?raw';

interface NewProjectDialogProps {
    onClose: () => void;
}

const TEMPLATES = [
    { label: 'Empty Project', desc: 'Blank scene, start fresh', raw: emptyTemplate },
    { label: 'Platformer', desc: 'Player, gravity, jump & run', raw: platformerTemplate },
    { label: 'Top-down', desc: 'WASD movement, collision walls', raw: topdownTemplate },
    { label: 'Space Shooter', desc: 'Shoot enemies, score points', raw: spaceShooterTemplate },
];

export const NewProjectDialog: React.FC<NewProjectDialogProps> = ({ onClose }) => {
    const { setProject, setFileHandle, markDirty } = useProjectStore();

    const handleSelect = async (raw: string) => {
        try {
            const projectData = JSON.parse(raw);
            await clearAutoSave();
            setFileHandle(null);
            setProject(projectData);
            markDirty();
            onClose();
        } catch (e) {
            console.error('Failed to load template', e);
            alert('Failed to load template');
        }
    };

    return (
        <div className="dialog-overlay">
            <div style={{
                background: 'var(--glix-bg)',
                border: '1px solid var(--glix-border-hi)',
                borderRadius: 12,
                padding: 0,
                maxWidth: 460,
                width: '92%',
                overflow: 'hidden',
                boxShadow: 'var(--glix-shadow)',
            }}>
                {/* Header */}
                <div style={{
                    background: 'var(--glix-bg-deep)',
                    padding: '20px 24px',
                    borderBottom: '1px solid var(--glix-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--glix-text)' }}>New Project</div>
                        <div style={{ fontSize: 11, color: 'var(--glix-text-muted)', marginTop: 2 }}>Choose a starting template</div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: 'none', color: 'var(--glix-text-dim)',
                            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px',
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Templates */}
                <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {TEMPLATES.map(t => (
                        <button
                            key={t.label}
                            onClick={() => handleSelect(t.raw)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '12px 14px', borderRadius: 8,
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
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 600 }}>{t.label}</div>
                                <div style={{ fontSize: 10, color: 'var(--glix-text-muted)', marginTop: 2 }}>{t.desc}</div>
                            </div>
                            <ArrowUpRight size={12} style={{ color: 'var(--glix-text-dim)' }} />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
