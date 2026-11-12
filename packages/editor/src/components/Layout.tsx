import React, { useRef, useEffect, useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';

interface LayoutProps {
    left: React.ReactNode;
    center: React.ReactNode;
    right: React.ReactNode;
    top: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ left, center, right, top }) => {
    const {
        leftPanelWidth, rightPanelWidth, setLeftPanelWidth, setRightPanelWidth,
        activeRightTab, setActiveRightTab,
        mobileLeftOpen, setMobileLeftOpen, mobileRightOpen, setMobileRightOpen,
    } = useEditorStore();
    const isResizingLeft = useRef(false);
    const isResizingRight = useRef(false);
    // Which bottom-nav item was tapped last (mobile only, for active state).
    const [mobileNav, setMobileNav] = useState<'scene' | 'inspector' | 'animation' | 'extensions' | 'mobile-controller' | 'assets' | null>(null);

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
            className={`glix-divider glix-divider-${side}`}
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

    const openRightTab = (tab: 'inspector' | 'animation' | 'extensions' | 'mobile-controller', nav: 'inspector' | 'animation' | 'extensions' | 'mobile-controller') => {
        setActiveRightTab(tab);
        setMobileRightOpen(true);
        setMobileLeftOpen(false);
        setMobileNav(nav);
    };
    const openLeft = (nav: 'scene' | 'assets') => {
        setMobileLeftOpen(true);
        setMobileRightOpen(false);
        setMobileNav(nav);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--glix-bg)', paddingTop: 'env(safe-area-inset-top)' }}>
            {/* Toolbar */}
            <div style={{ height: 42, flexShrink: 0, borderBottom: '1px solid var(--glix-border)', background: 'var(--glix-bg-alt)' }}>{top}</div>

            {/* Main body */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                {/* Left */}
                <div className="glix-panel-left" style={{
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
                <div className="glix-panel-center" style={{ flex: 1, background: '#050608', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
                    {center}
                </div>

                {divider('right')}

                {/* Right */}
                <div className="glix-panel-right" style={{
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

            {/* Mobile bottom nav (MOBILE_SPEC §1.1): at <=700px this is the
                only nav — viewport, hierarchy, inspector, animation,
                extensions, controller and assets must all be one tap away.
                Desktop: hidden by CSS. */}
            <nav className="glix-bottom-nav" aria-label="Editor panels">
                {([
                    { key: 'scene', label: 'Scene', onClick: () => openLeft('scene'), active: mobileNav === 'scene' && mobileLeftOpen },
                    { key: 'inspector', label: 'Inspector', onClick: () => openRightTab('inspector', 'inspector'), active: mobileNav === 'inspector' && mobileRightOpen && activeRightTab === 'inspector' },
                    { key: 'animation', label: 'Animation', onClick: () => openRightTab('animation', 'animation'), active: mobileNav === 'animation' && mobileRightOpen && activeRightTab === 'animation' },
                    { key: 'extensions', label: 'Extensions', onClick: () => openRightTab('extensions', 'extensions'), active: mobileNav === 'extensions' && mobileRightOpen && activeRightTab === 'extensions' },
                    { key: 'mobile-controller', label: 'Controller', onClick: () => openRightTab('mobile-controller', 'mobile-controller'), active: mobileNav === 'mobile-controller' && mobileRightOpen && activeRightTab === 'mobile-controller' },
                    { key: 'assets', label: 'Assets', onClick: () => openLeft('assets'), active: mobileNav === 'assets' && mobileLeftOpen },
                ] as const).map(({ key, label, onClick, active }) => (
                    <button
                        key={key}
                        onClick={onClick}
                        aria-pressed={active}
                        style={{
                            flex: 1, minHeight: 44, background: 'transparent', border: 'none',
                            borderTop: active ? '2px solid var(--glix-accent)' : '2px solid transparent',
                            color: active ? 'var(--glix-accent)' : 'var(--glix-text-muted)',
                            fontSize: 11, fontWeight: 600, fontFamily: 'var(--glix-font)',
                            cursor: 'pointer', padding: '6px 2px',
                        }}
                    >
                        {label}
                    </button>
                ))}
            </nav>
        </div>
    );
};
