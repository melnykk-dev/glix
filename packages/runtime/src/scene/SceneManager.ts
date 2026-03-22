import { World } from '../core/World';
import { Engine } from '../core/Engine';
import { SceneTransitionComponent, MgexFile } from '@glix/shared';

export class SceneManager {
    private fileData: MgexFile | null = null;
    private transitionEntity: string | null = null;
    private currentSceneId: string = '';

    constructor(private world: World, private engine: Engine) { }

    public init(fileData: MgexFile) {
        this.fileData = fileData;
        const startScene = fileData.settings.startScene;
        if (startScene && fileData.scenes[startScene]) {
            this.addScene(startScene);
            this.currentSceneId = startScene;
        }
    }

    public getCurrentSceneId(): string {
        return this.currentSceneId;
    }

    public async loadScene(id: string) {
        if (!this.fileData || !this.fileData.scenes[id]) return;

        let transitionComp: SceneTransitionComponent | null = null;
        const canvasEntities = this.world.getEntitiesWithComponents('uiCanvas');
        for (const e of canvasEntities) {
            const trans = this.world.getComponent(e, 'sceneTransition');
            if (trans) { transitionComp = trans; break; }
        }

        if (transitionComp) {
            await this.playTransitionOut(transitionComp);
        } else {
            const engineRenderer = (this.engine as any).renderSystem;
            if (engineRenderer) {
                const gl = (engineRenderer as any).gl as WebGL2RenderingContext;
                gl.clearColor(0, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            await new Promise(res => setTimeout(res, 50));
        }

        this.unloadScene();
        this.addScene(id);
        this.currentSceneId = id;

        if (transitionComp) {
            await this.playTransitionIn(transitionComp);
        }
    }

    public addScene(id: string) {
        if (!this.fileData) return;
        const scene = this.fileData.scenes[id];
        if (!scene) return;

        for (const entityDef of scene.entities) {
            const entity = this.world.createEntity();
            if (entityDef.name) {
                this.world.setName(entity, entityDef.name);
            }
            for (const [type, data] of Object.entries(entityDef.components)) {
                this.world.addComponent(entity, type as any, JSON.parse(JSON.stringify(data)));
            }
        }
    }

    public unloadScene() {
        const allEntities = this.world.getEntitiesWithComponents();
        for (const e of allEntities) {
            if (!this.world.getComponent(e, 'persistent')) {
                if (e !== this.transitionEntity) {
                    this.world.removeEntity(e);
                }
            }
        }
        const rm = (this.engine as any).resourceManager;
        if (rm) {
            rm.garbageCollect(this.world);
        }
    }

    private parseColor(color: string): { r: number, g: number, b: number } {
        let r = 0, g = 0, b = 0;
        if (color.startsWith('#')) {
            if (color.length === 7) {
                r = parseInt(color.slice(1, 3), 16);
                g = parseInt(color.slice(3, 5), 16);
                b = parseInt(color.slice(5, 7), 16);
            }
        }
        return { r, g, b };
    }

    private async playTransitionOut(trans: SceneTransitionComponent) {
        return new Promise<void>(resolve => {
            const { r, g, b } = this.parseColor(trans.color);
            this.transitionEntity = this.world.createEntity();
            this.world.addComponent(this.transitionEntity, 'persistent', {});
            this.world.addComponent(this.transitionEntity, 'uiTransform', {
                anchorX: 0, anchorY: 0, pivotX: 0, pivotY: 0, offsetX: 0, offsetY: 0
            });
            const gl = (this.engine as any).gl;
            const w = gl ? gl.canvas.width : 2000;
            const h = gl ? gl.canvas.height : 2000;

            this.world.addComponent(this.transitionEntity, 'uiPanel', {
                width: w, height: h, color: `rgba(${r},${g},${b},0)`, borderRadius: 0
            });
            this.world.addComponent(this.transitionEntity, 'sortingLayer', { layer: 999, orderInLayer: 999 });

            let alpha = 0;
            const step = 0.05 / trans.duration;
            const interval = setInterval(() => {
                alpha += step;
                if (alpha >= 1) {
                    alpha = 1;
                    clearInterval(interval);
                    resolve();
                }
                const p = this.world.getComponent(this.transitionEntity!, 'uiPanel')!;
                p.color = `rgba(${r},${g},${b},${alpha})`;
            }, 16);
        });
    }

    private async playTransitionIn(trans: SceneTransitionComponent) {
        return new Promise<void>(resolve => {
            if (!this.transitionEntity) {
                resolve();
                return;
            }
            const { r, g, b } = this.parseColor(trans.color);
            let alpha = 1;
            const step = 0.05 / trans.duration;
            const interval = setInterval(() => {
                alpha -= step;
                if (alpha <= 0) {
                    alpha = 0;
                    clearInterval(interval);
                    this.world.removeEntity(this.transitionEntity!);
                    this.transitionEntity = null;
                    resolve();
                } else {
                    const p = this.world.getComponent(this.transitionEntity!, 'uiPanel')!;
                    p.color = `rgba(${r},${g},${b},${alpha})`;
                }
            }, 16);
        });
    }
}
