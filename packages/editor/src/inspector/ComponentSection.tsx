import React, { useState } from 'react';
import { ComponentType } from '@glix/shared';
import { useEditorStore } from '../store/useEditorStore';
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
    transform: '#6366F1', sprite: '#8B5CF6', rigidBody: '#3B82F6',
    boxCollider: '#10B981', script: '#F59E0B', uiLabel: '#A855F7',
    uiButton: '#EC4899', uiPanel: '#6366F1', tilemap: '#84CC16',
};

const ADVANCED_PROPS: Record<string, string[]> = {
    rigidBody: ['gravityScale', 'linearDamping', 'angularDamping', 'fixedRotation'],
    boxCollider: ['offsetX', 'offsetY', 'isSensor', 'restitution', 'friction'],
    circleCollider: ['offsetX', 'offsetY', 'isSensor', 'restitution', 'friction'],
    sprite: ['pivotX', 'pivotY'],
};

export const ComponentSection: React.FC<Props> = ({ entityId, type, data, onRemove }) => {
    const [collapsed, setCollapsed] = useState(false);
    const { pushCommand } = useHistoryStore();
    const { editorMode } = useEditorStore();

    const accentColor = COMPONENT_COLORS[type] || '#533483';

    const handleChange = (key: string, value: any) => {
        const engine = editorBridge.getEngine();
        const comp = engine?.getWorld().getComponent(entityId, type) as any;
        const oldVal = comp?.[key];
        pushCommand(new UpdatePropertyCommand(entityId, type, key, oldVal, value));
    };

    return (
        <div className="inspector-section">
            {/* Header */}
            <div
                style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', cursor: 'pointer',
                    background: collapsed ? 'transparent' : 'rgba(255,255,255,0.02)',
                    userSelect: 'none',
                    transition: 'background 0.2s',
                    borderBottom: collapsed ? 'none' : '1px solid var(--glix-border)'
                }}
                onClick={() => setCollapsed(c => !c)}
            >
                <ChevronRight
                    size={12}
                    style={{ color: accentColor, transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)', flexShrink: 0 }}
                />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--glix-text)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{type}</span>
                <div style={{ flex: 1 }} />
                <button
                    className="icon-btn danger"
                    style={{ padding: '2px', opacity: 0.3 }}
                    onClick={e => { e.stopPropagation(); onRemove(); }}
                    title="Remove component"
                >
                    <X size={12} />
                </button>
            </div>

            {/* Props */}
            {!collapsed && data && (
                <div style={{ padding: '2px 0 6px' }}>
                    {Object.entries(data)
                        .filter(([key]) => {
                            if (editorMode === 'starter' && ADVANCED_PROPS[type]?.includes(key)) return false;
                            return true;
                        })
                        .map(([key, val]) => (
                            <PropertyEditor key={key} propKey={key} value={val} onChange={v => handleChange(key, v)} />
                        ))}
                </div>
            )}
        </div>
    );
};
