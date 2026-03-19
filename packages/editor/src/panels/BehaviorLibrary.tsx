import React from 'react';
import { BEHAVIORS, BehaviorDef } from '@glix/shared/src/Behaviors';
import { useEditorStore } from '../store/useEditorStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { AddComponentCommand } from '../history/commands/AddComponentCommand';
import { MousePointer2, Info } from 'lucide-react';

export const BehaviorLibrary: React.FC = () => {
    const { selectedEntityIds } = useEditorStore();
    const { pushCommand } = useHistoryStore();

    const handleAddBehavior = (behavior: BehaviorDef) => {
        if (selectedEntityIds.length === 0) return;
        selectedEntityIds.forEach(id => {
            pushCommand(new AddComponentCommand(id, 'script', {
                src: behavior.script,
                compiledJs: '' // Will be compiled on play
            }));
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="panel-label">
                <MousePointer2 size={11} />
                Logic Blocks
            </div>

            <div style={{ padding: '12px', flex: 1, overflowY: 'auto' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', background: 'rgba(233, 69, 96, 0.1)',
                    borderRadius: 6, marginBottom: 16, border: '1px solid rgba(233, 69, 96, 0.2)'
                }}>
                    <Info size={14} style={{ color: 'var(--glix-accent)' }} />
                    <span style={{ fontSize: 10, color: 'var(--glix-text-dim)', lineHeight: 1.4 }}>
                        Drag a block onto an entity or select one and click a block to add logic instantly.
                    </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                    {BEHAVIORS.map(b => (
                        <div
                            key={b.id}
                            className="behavior-block"
                            draggable
                            onDragStart={e => {
                                e.dataTransfer.setData('glix/behavior', JSON.stringify(b));
                            }}
                            onClick={() => handleAddBehavior(b)}
                            style={{
                                background: 'var(--glix-bg-panel)',
                                border: `2px solid ${b.color}`,
                                borderRadius: '8px 4px 4px 8px',
                                padding: '10px',
                                cursor: 'pointer',
                                transition: 'transform 0.1s, box-shadow 0.1s',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                        >
                            {/* Scratch-style "notch" simulation */}
                            <div style={{
                                position: 'absolute', top: 0, left: 0, bottom: 0, width: 4,
                                background: b.color
                            }} />

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 18 }}>{b.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--glix-text)' }}>{b.name}</div>
                                    <div style={{ fontSize: 9, color: 'var(--glix-text-dim)', marginTop: 2 }}>{b.description}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                .behavior-block:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    filter: brightness(1.1);
                }
                .behavior-block:active {
                    transform: translateY(0);
                }
            `}</style>
        </div>
    );
};
