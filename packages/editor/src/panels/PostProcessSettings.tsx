import React from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { Sliders, Zap, Monitor, Aperture, Sun } from 'lucide-react';

export const PostProcessSettings: React.FC = () => {
    const { project, updateProject } = useProjectStore();
    const settings = project?.settings.postProcess || {
        bloom: true,
        vignette: false,
        crt: false,
        bloomThreshold: 0.8,
        vignetteStrength: 0.3
    };

    const update = (key: string, value: any) => {
        updateProject(proj => ({
            ...proj,
            settings: {
                ...proj.settings,
                postProcess: {
                    ...proj.settings.postProcess,
                    [key]: value
                }
            }
        }));
    };

    const row = (label: string, icon: React.ReactNode, content: React.ReactNode) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--glix-border)' }}>
            <div style={{ color: 'var(--glix-text-muted)', display: 'flex' }}>{icon}</div>
            <div style={{ flex: 1, fontSize: 11, fontWeight: 500, color: 'var(--glix-text)' }}>{label}</div>
            <div>{content}</div>
        </div>
    );

    const toggle = (key: string) => (
        <input
            type="checkbox"
            checked={(settings as any)[key]}
            onChange={e => update(key, e.target.checked)}
            style={{ cursor: 'pointer', accentColor: 'var(--glix-accent)' }}
        />
    );

    const slider = (key: string, min: number, max: number, step: number) => (
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={(settings as any)[key]}
            onChange={e => update(key, parseFloat(e.target.value))}
            style={{ width: 80, cursor: 'pointer', accentColor: 'var(--glix-accent)' }}
        />
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent' }}>
            <div className="panel-label">
                <Sliders size={11} />
                Post-Processing
            </div>

            <div className="anim-fade-in" style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '16px 12px 8px', fontSize: 10, fontWeight: 700, color: 'var(--glix-accent)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Visual Stack
                </div>

                {row('Bloom Filter', <Sun size={14} />, toggle('bloom'))}
                {settings.bloom && row('Bloom Threshold', <Zap size={10} />, slider('bloomThreshold', 0, 1, 0.01))}

                {row('Vignette Effect', <Aperture size={14} />, toggle('vignette'))}
                {settings.vignette && row('Vignette Intensity', <Zap size={10} />, slider('vignetteStrength', 0, 1, 0.01))}

                {row('CRT Scanlines', <Monitor size={14} />, toggle('crt'))}

                <div style={{ padding: 20, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--glix-text-dim)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        Post-processing is applied in real-time to the final render buffer.
                    </div>
                </div>
            </div>
        </div>
    );
};
