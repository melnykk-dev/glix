import React, { useEffect, useState } from 'react';
import { editorBridge } from '../bridge/EditorBridge';

export const Profiler: React.FC = () => {
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        const engine = editorBridge.getEngine();
        if (engine) {
            engine.setProfilerEnabled(true);
        }

        const interval = setInterval(() => {
            if (engine) {
                const newData = engine.getProfilerData();
                setData(newData);
            }
        }, 1000 / 30);

        return () => {
            if (engine) {
                engine.setProfilerEnabled(false);
            }
            clearInterval(interval);
        };
    }, []);

    if (!data) return <div style={{ padding: '10px', fontSize: '12px' }}>Loading profiler...</div>;

    const systems = [
        { name: 'Render', key: 'render', color: '#E94560' },
        { name: 'Physics', key: 'physics', color: '#00cc00' },
        { name: 'Script', key: 'script', color: '#533483' },
        { name: 'UI', key: 'ui', color: '#00ccff' },
        { name: 'Animation', key: 'animation', color: '#ffcc00' },
    ];

    const maxTime = Math.max(...systems.map(s => data[s.key]), 16.6); // At least 60fps scale

    return (
        <div style={{
            padding: '10px',
            fontFamily: 'monospace',
            fontSize: '11px',
            background: '#1a1a2e',
            color: '#e0e0e0',
            borderTop: '1px solid #333'
        }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#E94560' }}>PROFILER</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {systems.map(s => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '70px' }}>{s.name}</div>
                        <div style={{
                            flex: 1,
                            height: '8px',
                            background: '#333',
                            position: 'relative',
                            borderRadius: '4px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${(data[s.key] / maxTime) * 100}%`,
                                height: '100%',
                                background: s.color
                            }} />
                        </div>
                        <div style={{ width: '45px', textAlign: 'right' }}>{data[s.key].toFixed(2)}ms</div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>Entities: <span style={{ color: '#E94560' }}>{data.entities}</span></div>
                <div>Physics Bodies: <span style={{ color: '#E94560' }}>{data.physicsBodies}</span></div>
            </div>
        </div>
    );
};
