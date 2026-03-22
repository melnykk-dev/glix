import { Entity } from '@glix/shared';
import { World } from '../core/World';
import { InputManager } from '../input/InputManager';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { AudioManager } from '../assets/AudioManager';
import { EventBus } from '../core/EventBus';
import { SceneManager } from '../scene/SceneManager';

export abstract class ScriptComponent {
    entity!: Entity;
    world!: Readonly<World>;
    input!: InputManager;
    physics!: PhysicsSystem;
    audio!: AudioManager;
    eventBus!: EventBus;
    sceneManager!: SceneManager;

    private _engine: any = null;

    onStart(): void { }

    __init(
        entity: Entity,
        world: World,
        input: InputManager,
        physics: PhysicsSystem,
        audio: AudioManager,
        eventBus: EventBus,
        sceneManager: SceneManager,
        engine?: any
    ): void {
        this.entity = entity;
        this.world = world;
        this.input = input;
        this.physics = physics;
        this.audio = audio;
        this.eventBus = eventBus;
        this.sceneManager = sceneManager;
        this._engine = engine ?? null;
    }

    onUpdate(_dt: number): void { }
    onCollision(_other: Entity): void { }
    onCollisionExit(_other: Entity): void { }
    onDestroy(): void { }

    // ── Physics helpers ───────────────────────────────────────────────────────

    setVelocity(x: number, y: number): void {
        this.physics.setVelocity(this.entity, x, y);
    }

    applyForce(x: number, y: number): void {
        this.physics.applyForce(this.entity, x, y);
    }

    applyImpulse(x: number, y: number): void {
        this.physics.applyImpulse(this.entity, x, y);
    }

    getVelocity(): { x: number; y: number } {
        return this.physics.getVelocity(this.entity);
    }

    isGrounded(): boolean {
        return this.physics.isGrounded(this.entity);
    }

    // ── Transform helpers ─────────────────────────────────────────────────────

    getPosition(): { x: number; y: number } {
        const t = (this.world as World).getComponent(this.entity, 'transform');
        return t ? { x: t.x, y: t.y } : { x: 0, y: 0 };
    }

    setPosition(x: number, y: number): void {
        const t = (this.world as World).getComponent(this.entity, 'transform');
        if (t) {
            t.x = x;
            t.y = y;
        }
        this.physics.teleport(this.entity, x, y);
    }

    getRotation(): number {
        const t = (this.world as World).getComponent(this.entity, 'transform');
        return t ? t.rotation : 0;
    }

    setRotation(radians: number): void {
        const t = (this.world as World).getComponent(this.entity, 'transform');
        if (t) t.rotation = radians;
    }

    get transform(): any {
        return (this.world as World).getComponent(this.entity, 'transform');
    }

    get name(): string {
        return (this.world as World).getName(this.entity) || '';
    }

    // ── Camera helpers ────────────────────────────────────────────────────────

    getCameraPosition(): { x: number; y: number } {
        if (this._engine) return { x: this._engine.cameraPosition[0], y: this._engine.cameraPosition[1] };
        return { x: 0, y: 0 };
    }

    setCameraPosition(x: number, y: number): void {
        if (this._engine) {
            this._engine.cameraPosition[0] = x;
            this._engine.cameraPosition[1] = y;
        }
    }

    setCameraZoom(zoom: number): void {
        if (this._engine) this._engine.cameraZoom = Math.max(0.05, zoom);
    }

    getCameraZoom(): number {
        return this._engine ? this._engine.cameraZoom : 1;
    }

    shakeCameraOnce(intensity: number = 0.3, duration: number = 0.4): void {
        if (!this._engine) return;
        const start = { x: this._engine.cameraPosition[0], y: this._engine.cameraPosition[1] };
        const elapsed = { t: 0 };
        const shake = setInterval(() => {
            elapsed.t += 0.016;
            const progress = elapsed.t / duration;
            if (progress >= 1) {
                clearInterval(shake);
                this._engine.cameraPosition[0] = start.x;
                this._engine.cameraPosition[1] = start.y;
                return;
            }
            const mag = intensity * (1 - progress);
            this._engine.cameraPosition[0] = start.x + (Math.random() - 0.5) * 2 * mag;
            this._engine.cameraPosition[1] = start.y + (Math.random() - 0.5) * 2 * mag;
        }, 16);
    }

    // ── Entity spawning ───────────────────────────────────────────────────────

    spawn(name: string, components: Record<string, any>): Entity {
        const w = this.world as World;
        const entity = w.createEntity();
        w.setName(entity, name);
        for (const [type, data] of Object.entries(components)) {
            w.addComponent(entity, type as any, JSON.parse(JSON.stringify(data)));
        }
        return entity;
    }

    // ── World search helpers ──────────────────────────────────────────────────

    findEntityByName(name: string): Entity | undefined {
        return (this.world as World).findEntityByName(name);
    }

    findEntitiesWithName(name: string): Entity[] {
        return (this.world as World).findEntitiesWithName(name);
    }

    addTag(entityId: Entity, tag: string): void {
        (this.world as World).addTag(entityId, tag);
    }

    removeTag(entityId: Entity, tag: string): void {
        (this.world as World).removeTag(entityId, tag);
    }

    hasTag(entityId: Entity, tag: string): boolean {
        return (this.world as World).hasTag(entityId, tag);
    }

    findEntitiesWithTag(tag: string): Entity[] {
        return (this.world as World).findEntitiesWithTag(tag);
    }

    getEntitiesWithComponents(...types: string[]): Entity[] {
        return (this.world as World).getEntitiesWithComponents(...(types as any));
    }

    // ── Destruction helpers ───────────────────────────────────────────────────

    destroy(): void {
        this.eventBus.emit('entityDestroyed', this.entity);
        (this.world as World).removeEntity(this.entity);
    }

    destroyEntity(entityId: Entity): void {
        this.eventBus.emit('entityDestroyed', entityId);
        (this.world as World).removeEntity(entityId);
    }

    destroyByName(name: string): void {
        const entity = this.findEntityByName(name);
        if (entity) this.destroyEntity(entity);
    }

    // ── Component helpers ─────────────────────────────────────────────────────

    getComponent<T = any>(entityId: Entity, type: string): T | undefined {
        return (this.world as World).getComponent(entityId, type as any) as T | undefined;
    }

    addComponent(entityId: Entity, type: string, data: any): void {
        (this.world as World).addComponent(entityId, type as any, data);
    }

    removeComponent(entityId: Entity, type: string): void {
        (this.world as World).removeComponent(entityId, type as any);
    }

    hasComponent(entityId: Entity, type: string): boolean {
        return (this.world as World).getComponent(entityId, type as any) !== undefined;
    }

    // ── Scene helpers ─────────────────────────────────────────────────────────

    reloadScene(): void {
        const id = this.sceneManager.getCurrentSceneId();
        if (id) {
            setTimeout(() => this.sceneManager.loadScene(id), 0);
        }
    }

    loadScene(sceneId: string): void {
        setTimeout(() => this.sceneManager.loadScene(sceneId), 0);
    }

    // ── Timing helpers ────────────────────────────────────────────────────────

    after(seconds: number, callback: () => void): void {
        setTimeout(callback, seconds * 1000);
    }
}
