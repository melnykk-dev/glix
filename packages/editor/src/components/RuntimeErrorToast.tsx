import React from 'react';
import { editorBridge } from '../bridge/EditorBridge';
import { useSceneStore } from '../store/useSceneStore';

interface ToastError {
    id: number;
    message: string;
    stack?: string;
    source: string;
    at: number;
}

let toastId = 0;

/**
 * Surfaces runtime errors where the user can see them: uncaught window errors,
 * unhandled promise rejections, game-loop crashes, and failed play() starts.
 * Game-loop errors are also mirrored to window.__glixRuntimeErrors for automation.
 */
export const RuntimeErrorToast: React.FC = () => {
    const [errors, setErrors] = React.useState<ToastError[]>([]);
    const playState = useSceneStore((s) => s.playState);

    const push = React.useCallback((message: string, source: string, stack?: string) => {
        const err: ToastError = { id: ++toastId, message, stack, source, at: Date.now() };
        (window as any).__glixRuntimeErrors = [...((window as any).__glixRuntimeErrors || []), err];
        setErrors((prev) => [...prev.slice(-4), err]);
    }, []);

    React.useEffect(() => {
        const onError = (e: ErrorEvent) => {
            push(e.message || 'Unknown error', 'window', e.error?.stack);
        };
        const onRejection = (e: PromiseRejectionEvent) => {
            const r: any = e.reason;
            push(r?.message || String(r), 'promise', r?.stack);
        };
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);

        // Attach to the engine once it exists; re-attach if it is recreated.
        let detach: (() => void) | null = null;
        let disposed = false;
        const attachTimer = window.setInterval(() => {
            if (disposed) return;
            const engine = editorBridge.getEngine();
            if (engine) {
                (window as any).__glixEngineStats = {
                    frameCount: engine.getFrameCount(),
                    isPlaying: engine.isPlaying(),
                    loopError: engine.getLastLoopError()?.message || null,
                };
                if (!detach) {
                    detach = engine.onLoopError((err) => {
                        push(err.message, 'game-loop', err.stack);
                    });
                }
            }
        }, 500);

        return () => {
            disposed = true;
            window.clearInterval(attachTimer);
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
            detach?.();
        };
    }, [push]);

    // Clear loop errors when leaving play mode so old crashes don't linger.
    React.useEffect(() => {
        if (playState === 'stopped') {
            setErrors((prev) => prev.filter((e) => e.source !== 'game-loop'));
        }
    }, [playState]);

    if (errors.length === 0) return null;

    return (
        <div
            data-testid="glix-runtime-errors"
            style={{
                position: 'fixed', right: 12, bottom: 12, zIndex: 9999,
                display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 'min(480px, 90vw)',
            }}
        >
            {errors.map((e) => (
                <div
                    key={e.id}
                    style={{
                        background: 'rgba(120, 20, 25, 0.96)', color: '#fff',
                        border: '1px solid rgba(255, 90, 90, 0.5)', borderRadius: 8,
                        padding: '10px 12px', fontSize: 12, fontFamily: 'monospace',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)', whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word', maxHeight: 220, overflowY: 'auto',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700 }}>⚠ {e.source === 'game-loop' ? 'Game loop crashed' : 'Runtime error'}</span>
                        <span style={{ opacity: 0.6, fontSize: 10 }}>({e.source})</span>
                        <button
                            onClick={() => setErrors((prev) => prev.filter((x) => x.id !== e.id))}
                            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                            title="Dismiss"
                        >✕</button>
                    </div>
                    <div>{e.message}</div>
                    {e.stack && (
                        <details style={{ marginTop: 6, opacity: 0.75, fontSize: 10 }}>
                            <summary style={{ cursor: 'pointer' }}>stack</summary>
                            <pre style={{ margin: '4px 0 0' }}>{e.stack.split('\n').slice(0, 6).join('\n')}</pre>
                        </details>
                    )}
                </div>
            ))}
        </div>
    );
};
