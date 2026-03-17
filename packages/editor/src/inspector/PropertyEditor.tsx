import React from 'react';

interface Props { propKey: string; value: any; onChange: (v: any) => void; }

export const PropertyEditor: React.FC<Props> = ({ propKey, value, onChange }) => {
    const type = typeof value;

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '3px 6px', fontSize: 11,
        background: 'var(--glix-bg-deep)', border: '1px solid var(--glix-border)',
        borderRadius: 'var(--glix-radius)', color: 'var(--glix-text)',
        fontFamily: 'var(--glix-font)',
    };

    let editor: React.ReactNode;

    if (type === 'boolean') {
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
                    }}/>
                </div>
                <span style={{ fontSize: 10, color: value ? 'var(--glix-accent)' : 'var(--glix-text-dim)' }}>
                    {value ? 'true' : 'false'}
                </span>
            </div>
        );
    } else if (type === 'number') {
        editor = (
            <input
                type="number"
                style={inputStyle}
                value={value}
                step={propKey.toLowerCase().includes('rotation') ? 1 : 0.1}
                onChange={e => onChange(parseFloat(e.target.value) || 0)}
            />
        );
    } else if (type === 'string' && (propKey.toLowerCase().includes('color') || value?.startsWith?.('#'))) {
        editor = (
            <div style={{ display: 'flex', gap: 4 }}>
                <input type="color" value={value || '#ffffff'} onChange={e => onChange(e.target.value)}
                    style={{ width: 28, height: 22, padding: 1, border: '1px solid var(--glix-border)', background: 'transparent', borderRadius: 'var(--glix-radius)', cursor: 'pointer' }}/>
                <input type="text" style={{ ...inputStyle, flex: 1 }} value={value || ''} onChange={e => onChange(e.target.value)}/>
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
            editor = <input type="text" style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)}/>;
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
                            <input type="number" style={inputStyle} value={value[k]} step={0.1}
                                onChange={e => onChange({ ...value, [k]: parseFloat(e.target.value) || 0 })}/>
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
