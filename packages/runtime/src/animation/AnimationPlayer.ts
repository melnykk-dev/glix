/**
 * Godot-style AnimationPlayer for Glix (GODOT_PARITY.md item 25, was MISSING).
 *
 * Named animations made of tracks. A track targets one entity and animates
 * one thing over the animation's length:
 *   - 'property'     any dotted component path, e.g. 'transform.x',
 *                    'transform.rotation', 'transform.scaleX', 'sprite.tintColor'
 *   - 'position'     transform x/y as one { x, y } value per keyframe
 *   - 'sprite-frame' frameAnimation frames: number = frame index,
 *                    string = sprite region id
 *   - 'visibility'   boolean; writes `visible` on the transform component.
 *                    (Renderer convention: a missing `visible` means visible;
 *                    the render pass that hides `visible === false` entities
 *                    is a one-line follow-up in RenderSystem, not this file.)
 *
 * Pure logic + an `update(world, dt)` that applies tracks to entities.
 * It does NOT hook itself into the Engine loop — the core team adds the
 * one-line hook (see `createAnimationPlayerUpdate` below).
 */
import type { World } from '../core/World';
import type { Entity } from '@glix/shared';
import { applyEasing, lerp, type EasingName } from './easing';

export type LoopMode = 'once' | 'loop' | 'pingpong';
export type TrackKind = 'property' | 'position' | 'sprite-frame' | 'visibility';
export type AnimationPlayerState = 'stopped' | 'playing' | 'paused';

export interface AnimKeyframe<T = unknown> {
    /** Seconds from the start of the animation. */
    time: number;
    value: T;
    /** Easing applied to the segment arriving AT this keyframe. */
    easing?: EasingName;
}

export interface AnimTrack {
    kind: TrackKind;
    /** Entity the track animates. */
    target: Entity;
    /** Dotted component path for 'property' tracks, e.g. 'transform.x'. */
    property?: string;
    keyframes: AnimKeyframe[];
}

export interface GlixAnimation {
    name: string;
    /** Length in seconds. Keyframe times must lie within [0, length]. */
    length: number;
    loop?: LoopMode;
    tracks: AnimTrack[];
}

export interface PlayOptions {
    /** Start time in seconds (default 0). */
    from?: number;
    /** Playback speed multiplier (default 1). */
    speed?: number;
    /** Override the animation's own loop mode for this play. */
    loop?: LoopMode;
    /** Crossfade time in seconds from the previous pose (default 0 = cut). */
    blendTime?: number;
}

export interface AnimationPlayerSnapshot {
    animation: string | null;
    time: number;
    length: number;
    state: AnimationPlayerState;
    speed: number;
    loop: LoopMode;
    trackCount: number;
}

type Vec2Value = { x: number; y: number };

function isVec2(v: unknown): v is Vec2Value {
    return (
        typeof v === 'object' && v !== null &&
        typeof (v as Vec2Value).x === 'number' &&
        typeof (v as Vec2Value).y === 'number'
    );
}

/** Sample one track at time t. Numbers and {x,y} interpolate, everything else steps. */
export function sampleTrack(track: AnimTrack, t: number): unknown {
    const kfs = track.keyframes;
    if (kfs.length === 0) return undefined;
    if (t <= kfs[0].time) return kfs[0].value;
    const last = kfs[kfs.length - 1];
    if (t >= last.time) return last.value;
    for (let i = 0; i < kfs.length - 1; i++) {
        const a = kfs[i];
        const b = kfs[i + 1];
        if (t >= a.time && t < b.time) {
            const span = b.time - a.time;
            const raw = span > 0 ? (t - a.time) / span : 1;
            const eased = applyEasing(b.easing, raw);
            if (typeof a.value === 'number' && typeof b.value === 'number') {
                return lerp(a.value, b.value, eased);
            }
            if (isVec2(a.value) && isVec2(b.value)) {
                return { x: lerp(a.value.x, b.value.x, eased), y: lerp(a.value.y, b.value.y, eased) };
            }
            // Strings, booleans and anything else hold until the next keyframe.
            return a.value;
        }
    }
    return last.value;
}

/** Read a dotted path ('transform.x') off an entity's components. */
function readPath(world: World, entity: Entity, path: string): unknown {
    const [compType, ...rest] = path.split('.');
    const comp = (world as unknown as { getComponent(e: Entity, t: string): unknown })
        .getComponent(entity, compType) as Record<string, unknown> | undefined;
    if (!comp) return undefined;
    let cur: unknown = comp;
    for (const key of rest) {
        if (typeof cur !== 'object' || cur === null) return undefined;
        cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
}

/** Write a dotted path ('transform.x') onto an entity's components. No-op if the component is absent. */
function writePath(world: World, entity: Entity, path: string, value: unknown): void {
    const [compType, ...rest] = path.split('.');
    const comp = (world as unknown as { getComponent(e: Entity, t: string): unknown })
        .getComponent(entity, compType) as Record<string, unknown> | undefined;
    if (!comp || rest.length === 0) return;
    let cur: Record<string, unknown> = comp;
    for (let i = 0; i < rest.length - 1; i++) {
        const next = cur[rest[i]];
        if (typeof next !== 'object' || next === null) return;
        cur = next as Record<string, unknown>;
    }
    cur[rest[rest.length - 1]] = value;
}

export class AnimationPlayer {
    private animations = new Map<string, GlixAnimation>();
    private current: GlixAnimation | null = null;
    private time = 0;
    private direction: 1 | -1 = 1;
    private state: AnimationPlayerState = 'stopped';
    private speed = 1;
    private loopOverride: LoopMode | null = null;
    private blendTime = 0;
    private blendElapsed = 0;
    /** Property path -> value captured when a blend started. */
    private blendFrom = new Map<string, unknown>();
    private finishedHandlers = new Set<() => void>();

    addAnimation(anim: GlixAnimation): void {
        if (!anim.name || typeof anim.name !== 'string') {
            throw new Error('AnimationPlayer: animation must have a non-empty name.');
        }
        if (!(anim.length > 0)) {
            throw new Error(`AnimationPlayer: animation "${anim.name}" must have length > 0.`);
        }
        for (const track of anim.tracks) {
            if (track.kind === 'property' && !track.property) {
                throw new Error(`AnimationPlayer: property track in "${anim.name}" needs a property path (e.g. 'transform.x').`);
            }
            if (track.keyframes.length === 0) {
                throw new Error(`AnimationPlayer: track in "${anim.name}" needs at least one keyframe.`);
            }
            let prev = -Infinity;
            for (const kf of track.keyframes) {
                if (kf.time < 0 || kf.time > anim.length) {
                    throw new Error(`AnimationPlayer: keyframe time ${kf.time} in "${anim.name}" is outside [0, ${anim.length}].`);
                }
                if (kf.time < prev) {
                    throw new Error(`AnimationPlayer: keyframes in "${anim.name}" must be sorted by time.`);
                }
                prev = kf.time;
            }
        }
        this.animations.set(anim.name, anim);
    }

    removeAnimation(name: string): void {
        this.animations.delete(name);
        if (this.current?.name === name) this.stop();
    }

    getAnimation(name: string): GlixAnimation | undefined {
        return this.animations.get(name);
    }

    listAnimations(): string[] {
        return [...this.animations.keys()];
    }

    play(name: string, opts: PlayOptions = {}): void {
        const anim = this.animations.get(name);
        if (!anim) throw new Error(`AnimationPlayer: no animation named "${name}".`);
        this.blendTime = Math.max(0, opts.blendTime ?? 0);
        this.blendElapsed = 0;
        this.blendFrom.clear();
        this.current = anim;
        this.time = Math.min(Math.max(opts.from ?? 0, 0), anim.length);
        this.direction = 1;
        this.speed = opts.speed ?? 1;
        this.loopOverride = opts.loop ?? null;
        this.state = 'playing';
    }

    pause(): void {
        if (this.state === 'playing') this.state = 'paused';
    }

    resume(): void {
        if (this.state === 'paused') this.state = 'playing';
    }

    stop(): void {
        this.state = 'stopped';
        this.current = null;
        this.time = 0;
        this.blendFrom.clear();
    }

    /** Jump to a time (clamped) without changing play state; applied on the next update(world, 0). */
    seek(time: number): void {
        if (!this.current) return;
        this.time = Math.min(Math.max(time, 0), this.current.length);
    }

    setSpeed(speed: number): void {
        this.speed = speed > 0 ? speed : 1;
    }

    /** Fired when a 'once' animation reaches the end. Returns an unsubscribe function. */
    onFinished(cb: () => void): () => void {
        this.finishedHandlers.add(cb);
        return () => this.finishedHandlers.delete(cb);
    }

    get currentAnimation(): string | null {
        return this.current?.name ?? null;
    }

    get currentTime(): number {
        return this.time;
    }

    get currentLength(): number {
        return this.current?.length ?? 0;
    }

    get playerState(): AnimationPlayerState {
        return this.state;
    }

    get isPlaying(): boolean {
        return this.state === 'playing';
    }

    getState(): AnimationPlayerSnapshot {
        return {
            animation: this.current?.name ?? null,
            time: this.time,
            length: this.current?.length ?? 0,
            state: this.state,
            speed: this.speed,
            loop: this.loopOverride ?? this.current?.loop ?? 'once',
            trackCount: this.current?.tracks.length ?? 0,
        };
    }

    /**
     * Advance and apply the current animation. Safe to call every fixed step;
     * with dt = 0 it just (re)applies the current time — used by the editor
     * timeline scrub while paused.
     */
    update(world: World, dt: number): void {
        if (!this.current || this.state === 'stopped') return;
        const anim = this.current;
        const loop = this.loopOverride ?? anim.loop ?? 'once';

        if (this.state === 'playing') {
            if (this.blendTime > 0 && this.blendElapsed < this.blendTime) {
                this.blendElapsed = Math.min(this.blendElapsed + dt * this.speed, this.blendTime);
            }
            this.time += dt * this.speed * this.direction;
            if (loop === 'loop') {
                while (this.time >= anim.length) this.time -= anim.length;
                while (this.time < 0) this.time += anim.length;
            } else if (loop === 'pingpong') {
                if (this.time >= anim.length) {
                    this.time = anim.length;
                    this.direction = -1;
                } else if (this.time <= 0 && this.direction === -1) {
                    this.time = 0;
                    this.direction = 1;
                }
            } else {
                if (this.time >= anim.length) {
                    this.time = anim.length;
                    this.applyTracks(world, anim, this.time, 1);
                    this.state = 'stopped';
                    const handlers = [...this.finishedHandlers];
                    for (const cb of handlers) cb();
                    return;
                }
                if (this.time < 0) this.time = 0;
            }
        }

        const weight = this.blendTime > 0 ? Math.min(this.blendElapsed / this.blendTime, 1) : 1;
        this.applyTracks(world, anim, this.time, weight);
    }

    private blendKey(track: AnimTrack): string {
        return `${track.target}|${track.kind}|${track.property ?? ''}`;
    }

    private applyTracks(world: World, anim: GlixAnimation, t: number, weight: number): void {
        for (const track of anim.tracks) {
            const sampled = sampleTrack(track, t);
            if (sampled === undefined) continue;
            const key = this.blendKey(track);
            if (weight < 1) {
                if (!this.blendFrom.has(key)) {
                    this.blendFrom.set(key, this.readTrackValue(world, track));
                }
                const from = this.blendFrom.get(key);
                const blended = this.blendValues(from, sampled, weight);
                if (blended !== undefined) this.writeTrackValue(world, track, blended);
                continue;
            }
            this.writeTrackValue(world, track, sampled);
        }
    }

    private blendValues(from: unknown, to: unknown, weight: number): unknown {
        if (typeof from === 'number' && typeof to === 'number') return lerp(from, to, weight);
        if (isVec2(from) && isVec2(to)) {
            return { x: lerp(from.x, to.x, weight), y: lerp(from.y, to.y, weight) };
        }
        return to;
    }

    private readTrackValue(world: World, track: AnimTrack): unknown {
        if (track.kind === 'property' && track.property) return readPath(world, track.target, track.property);
        if (track.kind === 'position') {
            const x = readPath(world, track.target, 'transform.x');
            const y = readPath(world, track.target, 'transform.y');
            return typeof x === 'number' && typeof y === 'number' ? { x, y } : undefined;
        }
        if (track.kind === 'sprite-frame') {
            return readPath(world, track.target, 'frameAnimation.currentFrame');
        }
        if (track.kind === 'visibility') {
            return readPath(world, track.target, 'transform.visible');
        }
        return undefined;
    }

    private writeTrackValue(world: World, track: AnimTrack, value: unknown): void {
        if (track.kind === 'property' && track.property) {
            writePath(world, track.target, track.property, value);
            return;
        }
        if (track.kind === 'position' && isVec2(value)) {
            writePath(world, track.target, 'transform.x', value.x);
            writePath(world, track.target, 'transform.y', value.y);
            return;
        }
        if (track.kind === 'sprite-frame') {
            const frames = readPath(world, track.target, 'frameAnimation.frames') as string[] | undefined;
            if (typeof value === 'number' && Array.isArray(frames)) {
                const idx = Math.min(Math.max(Math.round(value), 0), frames.length - 1);
                writePath(world, track.target, 'frameAnimation.currentFrame', idx);
                writePath(world, track.target, 'sprite.region', frames[idx]);
            } else if (typeof value === 'string') {
                writePath(world, track.target, 'sprite.region', value);
            }
            return;
        }
        if (track.kind === 'visibility') {
            writePath(world, track.target, 'transform.visible', value === true);
        }
    }
}

/**
 * The Engine hook, for the core team. Returns an update function with the
 * exact signature the fixed step already uses for AnimationSystem.
 *
 * ONE-LINE HOOK (in Engine.tick, right after the animationSystem line):
 *   this.animationPlayer.update(this.world, fixedDtSeconds);
 * The player itself is constructed in the Engine constructor alongside the
 * other systems (`this.animationPlayer = new AnimationPlayer();`) and
 * exposed via `getAnimationPlayer()` for the editor panel and scripts.
 */
export function createAnimationPlayerUpdate(
    player: AnimationPlayer,
): (world: World, dt: number) => void {
    return (world, dt) => player.update(world, dt);
}
