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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${project.meta.name || 'Glix Game'}</title>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; background-color: #000; }
        canvas { display: block; width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <canvas id="glix-canvas"></canvas>
    <script>
        ${runtimeScript}
    </script>
    <script>
        const projectData = ${projectJson};
        const canvas = document.getElementById('glix-canvas');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });

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
