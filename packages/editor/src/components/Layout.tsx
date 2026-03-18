import React, { useRef, useEffect } from 'react';
import { useEditorStore } from '../store/useEditorStore';

interface LayoutProps {
    left: React.ReactNode;
    center: React.ReactNode;
    right: React.ReactNode;
    top: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ left, center, right, top }) => {
    const { leftPanelWidth, rightPanelWidth, setLeftPanelWidth, setRightPanelWidth } = useEditorStore();
    const isResizingLeft = useRef(false);
    const isResizingRight = useRef(false);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (isResizingLeft.current) setLeftPanelWidth(Math.max(180, e.clientX));
            if (isResizingRight.current) setRightPanelWidth(Math.max(200, window.innerWidth - e.clientX));
        };
        const onUp = () => {
            isResizingLeft.current = isResizingRight.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [setLeftPanelWidth, setRightPanelWidth]);

    const startResize = (side: 'left' | 'right') => {
        if (side === 'left') isResizingLeft.current = true;
        else isResizingRight.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    };

    const divider = (side: 'left' | 'right') => (
        <div
            onMouseDown={() => startResize(side)}
            style={{
                width: 4,
                background: 'var(--glix-border)',
                cursor: 'ew-resize',
                flexShrink: 0,
                transition: 'background 0.15s',
                zIndex: 10,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--glix-accent)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--glix-border)')}
        />
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--glix-bg)' }}>
            {/* Toolbar */}
            <div style={{ height: 42, flexShrink: 0, borderBottom: '1px solid var(--glix-border)', background: 'var(--glix-bg-alt)' }}>{top}</div>

            {/* Main body */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                {/* Left */}
                <div style={{
                    width: leftPanelWidth,
                    flexShrink: 0,
                    background: 'var(--glix-bg-panel)',
                    backdropFilter: 'blur(var(--glix-blur))',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    borderRight: '1px solid var(--glix-border)'
                }}>
                    {left}
                </div>

                {divider('left')}

                {/* Viewport */}
                <div style={{ flex: 1, background: '#050608', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
                    {center}
                </div>

                {divider('right')}

                {/* Right */}
                <div style={{
                    width: rightPanelWidth,
                    flexShrink: 0,
                    background: 'var(--glix-bg-panel)',
                    backdropFilter: 'blur(var(--glix-blur))',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    borderLeft: '1px solid var(--glix-border)'
                }}>
                    {right}
                </div>
            </div>
        </div>
    );
};
