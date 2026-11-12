import { MgexFile } from '@glix/shared';

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[c] as string));
}

export async function exportProject(project: MgexFile): Promise<void> {
    try {
        // Fetch the runtime script built by vite library mode
        const response = await fetch('/runtime.iife.js');
        if (!response.ok) {
            throw new Error(`Failed to load runtime bundle: ${response.statusText}`);
        }
        const runtimeScript = await response.text();

        const projectJson = JSON.stringify(project);
        const gameTitle = escapeHtml(project.meta.name || 'Glix Game');
        const bgColor = (project.settings as any)?.backgroundColor || '#12122A';

        // Generate standalone HTML
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>${gameTitle}</title>
    <link rel="icon" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI3IiBmaWxsPSIjMUExQTJFIi8+PHJlY3QgeD0iNCIgeT0iNCIgd2lkdGg9IjciIGhlaWdodD0iNyIgcng9IjEuNSIgZmlsbD0iI0U5NDU2MCIvPjxyZWN0IHg9IjEzIiB5PSI0IiB3aWR0aD0iNyIgaGVpZ2h0PSI3IiByeD0iMS41IiBmaWxsPSIjRTk0NTYwIi8+PHJlY3QgeD0iMjIiIHk9IjQiIHdpZHRoPSI3IiBoZWlnaHQ9IjciIHJ4PSIxLjUiIGZpbGw9IiNFOTQ1NjAiLz48cmVjdCB4PSI0IiB5PSIxMyIgd2lkdGg9IjciIGhlaWdodD0iNyIgcng9IjEuNSIgZmlsbD0iI0U5NDU2MCIvPjxyZWN0IHg9IjQiIHk9IjIyIiB3aWR0aD0iNyIgaGVpZ2h0PSI3IiByeD0iMS41IiBmaWxsPSIjRTk0NTYwIi8+PHJlY3QgeD0iMTMiIHk9IjIyIiB3aWR0aD0iNyIgaGVpZ2h0PSI3IiByeD0iMS41IiBmaWxsPSIjNTMzNDgzIi8+PHJlY3QgeD0iMjIiIHk9IjIyIiB3aWR0aD0iNyIgaGVpZ2h0PSI3IiByeD0iMS41IiBmaWxsPSIjNTMzNDgzIi8+PC9zdmc+">
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
        /* Tap-to-start overlay (MOBILE_SPEC.md §4): audio starts only after a
           user gesture, so the game waits behind this overlay until the
           player taps. It also gates engine start, so nothing plays before
           the player is ready. */
        #glix-start-overlay {
            position: fixed;
            inset: 0;
            z-index: 50;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
            box-sizing: border-box;
            background: ${bgColor};
            color: rgba(255,255,255,0.92);
            font-family: system-ui, -apple-system, sans-serif;
            text-align: center;
            cursor: pointer;
            touch-action: manipulation;
            transition: opacity 300ms ease;
        }
        #glix-start-overlay.glix-fading { opacity: 0; }
        #glix-start-overlay:focus-visible { outline: 2px solid rgba(255,255,255,0.7); outline-offset: -2px; }
        .glix-start-title { font-size: 28px; font-weight: 700; letter-spacing: 0.01em; margin-bottom: 28px; }
        .glix-start-cta {
            display: inline-block;
            padding: 14px 34px;
            border-radius: 999px;
            font-size: 17px;
            font-weight: 700;
            letter-spacing: 0.04em;
            color: #F5F5F5;
            background: #E94560;
            box-shadow: 0 4px 24px rgba(0,0,0,0.45);
        }
        .glix-start-note { margin-top: 18px; font-size: 13px; color: rgba(255,255,255,0.55); }
        .glix-start-error { margin-top: 18px; font-size: 13px; color: #ff9d9d; display: none; }
    </style>
</head>
<body>
    <canvas id="glix-canvas"></canvas>
    <button id="glix-fs-btn" aria-label="Toggle fullscreen" title="Fullscreen"></button>
    <div id="glix-start-overlay" role="button" tabindex="0" aria-label="Tap to start game">
        <div>
            <div class="glix-start-title">${gameTitle}</div>
            <div class="glix-start-cta">Tap to start</div>
            <div class="glix-start-note">Audio starts after you tap</div>
            <div class="glix-start-error" id="glix-start-error"></div>
        </div>
    </div>
    <script>
        ${runtimeScript}
    </script>
    <script>
        const projectData = ${projectJson};
        const canvas = document.getElementById('glix-canvas');
        const fsBtn = document.getElementById('glix-fs-btn');
        const startOverlay = document.getElementById('glix-start-overlay');
        const startError = document.getElementById('glix-start-error');
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
            if (!window.GlixEngine || !window.GlixEngine.Engine) {
                console.error("GlixEngine is not defined in the runtime bundle.");
                alert("Runtime bundle missing or corrupt.");
                return;
            }
            const gl = canvas.getContext('webgl2', { alpha: false });
            if (!gl) {
                alert('WebGL2 is not supported by your browser.');
                return;
            }

            const engine = new window.GlixEngine.Engine({ gl });
            // Debug/QA handle: lets a test (or the player) inspect engine
            // state — e.g. engine.isPlaying(), engine.getInputMap().
            window.__glix = { engine };
            // Apply the project to the engine (Viewport, 2026-11-12): this
            // is what carries settings.backgroundColor and
            // settings.viewportMode into the render path. The editor calls
            // engine.setProject() too (Viewport.tsx); without this line an
            // exported game ran on the engine defaults — dark background
            // and 'expand' whatever the project asked for.
            engine.setProject(projectData);
            const audioManager = engine.getAudioManager();
            const preloader = engine.getAssetPreloader();

            // Preload non-audio assets now; audio assets wait for the tap
            // (AudioManager must only initialise after a user gesture).
            // Each asset type goes to its own loader: atlas/tileset data
            // is JSON, and feeding it to loadTexture makes TextureLoader
            // set it as an Image src (relative URL -> 404 -> the whole
            // export fails to start). Audio stays deferred to the tap.
            const assets = Object.values(projectData.assets || {});
            const texturePromises = assets.map((asset) => {
                if (asset.type === 'texture') {
                    return preloader.loadTexture(asset.id, asset.data);
                }
                if (asset.type === 'spriteatlas') {
                    return preloader.loadAtlas(asset.id, asset.data);
                }
                if (asset.type === 'tileset') {
                    return preloader.loadTileset(asset.id, asset.data);
                }
                return Promise.resolve();
            });
            const audioAssets = assets.filter((asset) => asset.type === 'audio');
            const texturesReady = Promise.all(texturePromises);
            texturesReady.catch((err) => {
                console.error('Failed to load assets', err);
                alert('Failed to load assets: ' + err.message);
            });

            // ── Tap to start ────────────────────────────────────────────────
            // The overlay is visible from first paint. The tap is the user
            // gesture: only inside it do we unlock audio, load audio assets,
            // and start the engine. Tapping again while starting is a no-op.
            var started = false;
            var startGame = function () {
                if (started) return;
                started = true;
                texturesReady
                    .then(function () { return audioManager.unlock(); })
                    .then(function () {
                        // One bad sound must not brick the game: warn and continue.
                        return Promise.all(audioAssets.map(function (asset) {
                            return audioManager.loadAudio(asset.id, asset.data).catch(function (err) {
                                console.warn('[Glix] Failed to load audio "' + asset.id + '":', err);
                            });
                        }));
                    })
                    .then(function () {
                        engine.getSceneManager().init(projectData);
                        engine.start();
                        // On-screen touch controls (auto-shows on touch devices).
                        // Feeds InputManager directly — no synthetic key events.
                        try {
                            var gamepadOptions = window.GlixEngine.VirtualGamepad.fromProjectSettings(projectData.settings);
                            if (window.GlixEngine && window.GlixEngine.VirtualGamepad) {
                                new window.GlixEngine.VirtualGamepad(engine.getInputManager(), canvas, gamepadOptions).attach();
                            }
                        } catch (touchErr) {
                            console.warn('[Glix] Touch controls failed to initialize:', touchErr);
                        }
                        startOverlay.classList.add('glix-fading');
                        setTimeout(function () {
                            if (startOverlay.parentElement) startOverlay.parentElement.removeChild(startOverlay);
                        }, 320);
                    })
                    .catch(function (err) {
                        started = false;
                        console.error('[Glix] Failed to start game:', err);
                        startError.textContent = 'Could not start — tap to retry.';
                        startError.style.display = 'block';
                    });
            };
            startOverlay.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                startGame();
            });
            startOverlay.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    startGame();
                }
            });
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
