import React, { useRef, useEffect, useState } from 'react';
import { X, Save, Eraser, Paintbrush } from 'lucide-react';

interface PixelEditorProps {
    initialData?: string;
    onSave: (dataUrl: string) => void;
    onClose: () => void;
}

export const PixelEditor: React.FC<PixelEditorProps> = ({ initialData, onSave, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState(16);
    const [color, setColor] = useState('#ffffff');
    const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
    const [isDrawing, setIsDrawing] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;
        if (initialData) {
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0, size, size);
            img.src = initialData;
        } else {
            ctx.clearRect(0, 0, size, size);
        }
    }, [size, initialData]);

    const getMousePos = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: Math.floor((clientX - rect.left) * scaleX),
            y: Math.floor((clientY - rect.top) * scaleY)
        };
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { x, y } = getMousePos(e);
        if (tool === 'pen') {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
        } else {
            ctx.clearRect(x, y, 1, 1);
        }
    };

    const handleSave = () => {
        if (!canvasRef.current) return;
        onSave(canvasRef.current.toDataURL());
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                background: 'var(--glix-bg)', border: '1px solid var(--glix-border)',
                borderRadius: 8, width: 500, padding: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Pixel Editor</div>
                    <button onClick={onClose} className="icon-btn"><X size={16} /></button>
                </div>

                <div style={{ display: 'flex', gap: 20 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 11, color: 'var(--glix-text-dim)' }}>Size</div>
                        <select value={size} onChange={e => setSize(Number(e.target.value))} className="select-full">
                            <option value={8}>8x8</option>
                            <option value={16}>16x16</option>
                            <option value={32}>32x32</option>
                        </select>

                        <div style={{ fontSize: 11, color: 'var(--glix-text-dim)', marginTop: 10 }}>Tools</div>
                        <div style={{ display: 'flex', gap: 5 }}>
                            <button
                                onClick={() => setTool('pen')}
                                className={`icon-btn ${tool === 'pen' ? 'active' : ''}`}
                                style={{ background: tool === 'pen' ? 'var(--glix-select-bg)' : 'transparent', padding: 8, borderRadius: 4 }}
                            >
                                <Paintbrush size={14} />
                            </button>
                            <button
                                onClick={() => setTool('eraser')}
                                className={`icon-btn ${tool === 'eraser' ? 'active' : ''}`}
                                style={{ background: tool === 'eraser' ? 'var(--glix-select-bg)' : 'transparent', padding: 8, borderRadius: 4 }}
                            >
                                <Eraser size={14} />
                            </button>
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--glix-text-dim)', marginTop: 10 }}>Color</div>
                        <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: '100%', height: 30, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{
                            border: '1px solid var(--glix-border)', background: '#000',
                            imageRendering: 'pixelated', width: 320, height: 320, cursor: 'crosshair'
                        }}>
                            <canvas
                                ref={canvasRef}
                                width={size}
                                height={size}
                                style={{ width: '100%', height: '100%' }}
                                onMouseDown={(e) => { setIsDrawing(true); draw(e); }}
                                onMouseMove={draw}
                                onMouseUp={() => setIsDrawing(false)}
                                onMouseLeave={() => setIsDrawing(false)}
                            />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <button onClick={onClose} className="btn-secondary">Cancel</button>
                    <button onClick={handleSave} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Save size={14} /> Save to Assets
                    </button>
                </div>
            </div>
        </div>
    );
};
