import { MgexFile } from '@glix/shared';

export async function exportProject(project: MgexFile): Promise<void> {
    try {
        // Fetch the runtime script built by vite library mode
        const response = await fetch('/runtime.iife.js');
        if (!response.ok) {
            throw new Error(`Failed to load runtime bundle: ${response.statusText}`);
        }
        const runtimeScript = await response.text();

        const projectJson = JSON.stringify(project);

        // Generate standalone HTML
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>${project.meta.name || 'Glix Game'}</title>
    <style>
        html, body { margin: 0; padding: 0; overflow: hidden; background-color: #000; overscroll-behavior: none; }
        /* Fixed positioning keeps the game under the notch/Dynamic Island and
           stops iOS Safari's collapsing chrome from trapping the player. */
        body { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh;
               -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
        canvas { display: block; width: 100vw; height: 100vh; height: 100dvh; touch-action: none; }
        #glix-fs-btn {
            position: fixed;
            top: max(10px, env(safe-area-inset-top));
            right: max(10px, env(safe-area-inset-right));
            z-index: 40;
            width: 40px; height: 40px;
            display: none;
            align-items: center; justify-content: center;
            border-radius: 50%;
            color: rgba(255,255,255,0.75);
            background: rgba(12,16,26,0.45);
            border: 1px solid rgba(255,255,255,0.22);
            cursor: pointer;
            touch-action: manipulation;
        }
        #glix-fs-btn.glix-show { display: flex; }
    </style>
</head>
<body>
    <canvas id="glix-canvas"></canvas>
    <button id="glix-fs-btn" aria-label="Toggle fullscreen" title="Fullscreen"></button>
    <script>
        ${runtimeScript}
    </script>
    <script>
        const projectData = ${projectJson};
        const canvas = document.getElementById('glix-canvas');
        const fsBtn = document.getElementById('glix-fs-btn');
        const fitCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        fitCanvas();

        window.addEventListener('resize', fitCanvas);
        window.addEventListener('orientationchange', fitCanvas);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', fitCanvas);
        }

        // Fullscreen affordance (phones): show only where the Fullscreen API
        // exists; iPhone Safari has none, so the button stays hidden there.
        // Landscape lock is attempted best-effort and failures are ignored.
        (function () {
            var svgExpand = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
            var svgShrink = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
            var el = document.documentElement;
            var canFs = !!(el.requestFullscreen || el.webkitRequestFullscreen);
            if (!canFs) return;
            fsBtn.classList.add('glix-show');
            var paint = function () {
                var active = !!(document.fullscreenElement || document.webkitFullscreenElement);
                fsBtn.innerHTML = active ? svgShrink : svgExpand;
            };
            fsBtn.innerHTML = svgExpand;
            fsBtn.addEventListener('click', function () {
                try {
                    var active = !!(document.fullscreenElement || document.webkitFullscreenElement);
                    if (active) {
                        if (document.exitFullscreen) document.exitFullscreen();
                        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                    } else {
                        var p;
                        if (el.requestFullscreen) p = el.requestFullscreen();
                        else if (el.webkitRequestFullscreen) p = el.webkitRequestFullscreen();
                        if (p && p.catch) p.catch(function () {});
                        try {
                            if (screen.orientation && screen.orientation.lock) {
                                var lp = screen.orientation.lock('landscape');
                                if (lp && lp.catch) lp.catch(function () {});
                            }
                        } catch (lockErr) { /* orientation lock is best-effort */ }
                    }
                } catch (fsErr) { /* fullscreen is best-effort */ }
            });
            document.addEventListener('fullscreenchange', paint);
            document.addEventListener('webkitfullscreenchange', paint);
            // Stop the gamepad overlay from swallowing the button's touches.
            fsBtn.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
        })();

        window.addEventListener('load', () => {
            if (window.GlixEngine && window.GlixEngine.Engine) {
                const gl = canvas.getContext('webgl2', { alpha: false });
                if (!gl) {
                    alert('WebGL2 is not supported by your browser.');
                    return;
                }
                
                const engine = new window.GlixEngine.Engine({ gl });
                
                // Preload assets before starting the scene
                const preloader = engine.getAssetPreloader();
                const audioManager = engine.getAudioManager();
                
                // Load assets from project definition
                const assetsToLoad = Object.values(projectData.assets || {});
                const promises = assetsToLoad.map(asset => {
                    if (asset.type === 'texture' || asset.type === 'spriteatlas' || asset.type === 'tileset') {
                        return preloader.loadTexture(asset.id, asset.data);
                    } else if (asset.type === 'audio') {
                        return audioManager.loadAudio(asset.id, asset.data);
                    }
                });
                
                Promise.all(promises).then(() => {
                    engine.getSceneManager().init(projectData);
                    engine.start();
                    // On-screen touch controls (auto-shows on touch devices).
                    try {
                        var touchMode = (projectData.settings && projectData.settings.touchControls) || 'auto';
                        if (window.GlixEngine && window.GlixEngine.VirtualGamepad) {
                            new window.GlixEngine.VirtualGamepad(canvas, { mode: touchMode }).attach();
                        }
                    } catch (touchErr) {
                        console.warn('[Glix] Touch controls failed to initialize:', touchErr);
                    }
                }).catch(err => {
                    console.error('Failed to load assets', err);
                    alert('Failed to load assets: ' + err.message);
                });
            } else {
                console.error("GlixEngine is not defined in the runtime bundle.");
                alert("Runtime bundle missing or corrupt.");
            }
        });
    </script>
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.meta.name || 'game'}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (e: any) {
        console.error('Export failed:', e);
        alert('Failed to export project: ' + e.message);
    }
}
