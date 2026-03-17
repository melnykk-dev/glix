import React from 'react';
import { shortcutManager } from '../shortcuts/ShortcutManager';

interface ShortcutsDialogProps {
    onClose: () => void;
}

export const ShortcutsDialog: React.FC<ShortcutsDialogProps> = ({ onClose }) => {
    const shortcuts = shortcutManager.getShortcuts();

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
        }}>
            <div style={{
                background: '#1a1a2e',
                border: '1px solid #333',
                padding: '30px',
                width: '500px',
                color: '#fff',
                borderRadius: '8px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                fontFamily: 'monospace'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, color: '#e94560', fontSize: '18px' }}>KEYBOARD SHORTCUTS</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: '20px' }}>×</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
                    {shortcuts.map(s => (
                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #222', paddingBottom: '6px' }}>
                            <div style={{ color: '#ccc' }}>{s.description}</div>
                            <div style={{ background: '#333', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', color: '#e94560' }}>
                                {s.keys.toUpperCase()}
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    onClick={onClose}
                    style={{
                        width: '100%',
                        padding: '10px',
                        marginTop: '25px',
                        background: '#333',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    CLOSE
                </button>
            </div>
        </div>
    );
};
