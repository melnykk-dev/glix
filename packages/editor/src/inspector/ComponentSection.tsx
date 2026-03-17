import React, { useState } from 'react';
import { ComponentType } from '@glix/shared';
import { PropertyEditor } from './PropertyEditor';
import { editorBridge } from '../bridge/EditorBridge';
import { useHistoryStore } from '../store/useHistoryStore';
import { UpdatePropertyCommand } from '../history/commands/UpdatePropertyCommand';
import { ChevronRight, X } from 'lucide-react';

interface Props {
    entityId: string;
    type: ComponentType;
    data: any;
    onRemove: () => void;
}

const COMPONENT_COLORS: Record<string, string> = {
    transform: '#E94560', sprite: '#533483', rigidBody: '#0F3460',
    boxCollider: '#1D7A5F', script: '#854F0B', uiLabel: '#533483',
    uiButton: '#E94560', uiPanel: '#185FA5', tilemap: '#3B6D11',
};

export const ComponentSection: React.FC<Props> = ({ entityId, type, data, onRemove }) => {
    const [collapsed, setCollapsed] = useState(false);
    const { pushCommand } = useHistoryStore();

    const accentColor = COMPONENT_COLORS[type] || '#533483';

    const handleChange = (key: string, value: any) => {
        const engine = editorBridge.getEngine();
        const comp = engine?.getWorld().getComponent(entityId, type) as any;
        const oldVal = comp?.[key];
        pushCommand(new UpdatePropertyCommand(entityId, type, key, oldVal, value));
    };

    return (
        <div style={{ borderBottom: '1px solid var(--glix-border)', marginBottom: 1 }}>
            {/* Header */}
            <div
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', cursor: 'pointer',
                    background: collapsed ? 'transparent' : 'rgba(255,255,255,0.02)',
                    userSelect: 'none',
                }}
                onClick={() => setCollapsed(c => !c)}
            >
                <ChevronRight
                    size={10}
                    style={{ color: accentColor, transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.15s', flexShrink: 0 }}
                />
                <span style={{ width: 6, height: 6, borderRadius: 1, background: accentColor, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--glix-text)', letterSpacing: '0.03em' }}>{type}</span>
                <button
                    className="icon-btn danger"
                    style={{ padding: '1px 3px', opacity: 0.5 }}
                    onClick={e => { e.stopPropagation(); onRemove(); }}
                    title="Remove component"
                >
                    <X size={10} />
                </button>
            </div>

            {/* Props */}
            {!collapsed && data && (
                <div style={{ padding: '2px 0 6px' }}>
                    {Object.entries(data).map(([key, val]) => (
                        <PropertyEditor key={key} propKey={key} value={val} onChange={v => handleChange(key, v)} />
                    ))}
                </div>
            )}
        </div>
    );
};
