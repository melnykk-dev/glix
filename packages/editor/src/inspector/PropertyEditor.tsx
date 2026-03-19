import React from 'react';
import { useProjectStore } from '../store/useProjectStore';

interface Props { propKey: string; value: any; onChange: (v: any) => void; }

const NumberInput: React.FC<{ value: number; step?: number; onChange: (v: number) => void; style?: React.CSSProperties }> = ({ value, step, onChange, style }) => {
    const [str, setStr] = React.useState(String(value));

    React.useEffect(() => {
        const parsed = parseFloat(str);
        if (isNaN(parsed) || parsed !== value) setStr(String(value));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
        <input
            type="text"
            style={style}
            value={str}
            onFocus={e => e.target.select()}
            onChange={e => {
                setStr(e.target.value);
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed) && e.target.value.trim() !== '-' && !e.target.value.endsWith('.')) {
                    onChange(parsed);
                }
            }}
            onBlur={() => {
                const parsed = parseFloat(str);
                if (isNaN(parsed)) {
                    setStr('0');
                    onChange(0);
                } else {
                    setStr(String(parsed));
                    onChange(parsed);
                }
            }}
        />
    );
};

export const PropertyEditor: React.FC<Props> = ({ propKey, value, onChange }) => {
    const { project } = useProjectStore();
    const type = typeof value;

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '3px 6px', fontSize: 11,
        background: 'var(--glix-bg-deep)', border: '1px solid var(--glix-border)',
        borderRadius: 'var(--glix-radius)', color: 'var(--glix-text)',
        fontFamily: 'var(--glix-font)',
    };

    let editor: React.ReactNode;

    const isAssetId = propKey.toLowerCase().endsWith('id') && propKey !== 'id';

    if (isAssetId && project) {
        const assets = Object.values(project.assets || {});
        let filtered = assets;
        if (propKey === 'textureId') filtered = assets.filter(a => a.type === 'texture');
        if (propKey === 'tilesetId') filtered = assets.filter(a => a.type === 'tileset');
        if (propKey === 'atlasId') filtered = assets.filter(a => a.type === 'spriteatlas');

        editor = (
            <select style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)}>
                <option value="">-- None --</option>
                {filtered.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                ))}
            </select>
        );
    } else if (type === 'boolean') {
        editor = (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                <div
                    onClick={() => onChange(!value)}
                    style={{
                        width: 28, height: 16, borderRadius: 8, cursor: 'pointer',
                        background: value ? 'var(--glix-accent)' : 'var(--glix-border-md)',
                        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}
                >
                    <div style={{
                        position: 'absolute', top: 2, left: value ? 14 : 2, width: 12, height: 12,
                        borderRadius: 6, background: '#fff', transition: 'left 0.2s',
                    }} />
                </div>
                <span style={{ fontSize: 10, color: value ? 'var(--glix-accent)' : 'var(--glix-text-dim)' }}>
                    {value ? 'true' : 'false'}
                </span>
            </div>
        );
    } else if (type === 'number') {
        editor = (
            <NumberInput
                style={inputStyle}
                value={value}
                step={propKey.toLowerCase().includes('rotation') ? 1 : 0.1}
                onChange={onChange}
            />
        );
    } else if (type === 'string' && (propKey.toLowerCase().includes('color') || value?.startsWith?.('#'))) {
        editor = (
            <div style={{ display: 'flex', gap: 4 }}>
                <input type="color" value={value || '#ffffff'} onChange={e => onChange(e.target.value)}
                    style={{ width: 28, height: 22, padding: 1, border: '1px solid var(--glix-border)', background: 'transparent', borderRadius: 'var(--glix-radius)', cursor: 'pointer' }} />
                <input type="text" style={{ ...inputStyle, flex: 1 }} value={value || ''} onChange={e => onChange(e.target.value)} />
            </div>
        );
    } else if (type === 'string') {
        const isEnum = propKey === 'type' && typeof value === 'string';
        if (isEnum && ['dynamic', 'static', 'kinematic'].includes(value)) {
            editor = (
                <select style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
                    <option value="dynamic">dynamic</option>
                    <option value="static">static</option>
                    <option value="kinematic">kinematic</option>
                </select>
            );
        } else {
            editor = <input type="text" style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)} />;
        }
    } else if (type === 'object' && value !== null && !Array.isArray(value)) {
        // Nested (e.g. vec2 x/y)
        const keys = Object.keys(value);
        if (keys.length === 2 && keys.includes('x') && keys.includes('y')) {
            editor = (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {keys.map(k => (
                        <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 9, color: 'var(--glix-text-dim)', paddingLeft: 2 }}>{k}</span>
                            <NumberInput
                                style={inputStyle}
                                value={value[k]}
                                step={0.1}
                                onChange={v => onChange({ ...value, [k]: v })}
                            />
                        </div>
                    ))}
                </div>
            );
        } else {
            editor = <span style={{ fontSize: 10, color: 'var(--glix-text-dim)' }}>{JSON.stringify(value).slice(0, 40)}</span>;
        }
    } else {
        editor = <span style={{ fontSize: 10, color: 'var(--glix-text-dim)' }}>{String(value)}</span>;
    }

    return (
        <div className="prop-row">
            <span className="prop-label" title={propKey}>{propKey}</span>
            <div>{editor}</div>
        </div>
    );
};
