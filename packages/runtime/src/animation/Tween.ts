/**
 * Tween for Glix (GODOT_PARITY.md item 26, was MISSING).
 *
 * Property tweens with easing, delay, loops and chaining — the Godot
 * `create_tween()` shape, in plain TypeScript. A Tween animates numeric
 * properties (dotted paths, e.g. 'x', 'scale.x', 'opacity') on any plain
 * object; the TweenManager steps every live tween once per frame.
 *
 *   const tw = new Tween(spriteTransform)
 *       .to('x', 100, 0.5, 'easeOutQuad')
 *       .delay(0.2)
 *       .to('y', 50, 0.3, 'easeInOutQuad')
 *       .setLoops(2)
 *       .onComplete(() => console.log('done'))
 *       .start();
 *   tweenManager.add(tw);
 *   // per frame: tweenManager.update(dt);
 */
import { applyEasing, lerp, type EasingName } from './easing';

export interface TweenStep {
    path: string;
    to: number;
    duration: number;
    delay: number;
    easing: EasingName;
}

function readPath(target: Record<string, unknown>, path: string): unknown {
    let cur: unknown = target;
    for (const key of path.split('.')) {
        if (typeof cur !== 'object' || cur === null) return undefined;
        cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
}

function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let cur: Record<string, unknown> = target;
    for (let i = 0; i < parts.length - 1; i++) {
        const next = cur[parts[i]];
        if (typeof next !== 'object' || next === null) return;
        cur = next as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
}

export class Tween {
    private readonly target: Record<string, unknown>;
    private steps: TweenStep[] = [];
    private pendingDelay = 0;
    private stepIndex = 0;
    private stepElapsed = 0;
    private stepFrom = 0;
    private stepStarted = false;
    private loops: number | 'infinite' = 1;
    private loopsDone = 0;
    private running = false;
    private finished = false;
    private completeHandlers = new Set<() => void>();
    private stepHandlers = new Set<(index: number) => void>();

    constructor(target: Record<string, unknown>) {
        this.target = target;
    }

    /** Tween `path` to `to` over `duration` seconds. */
    to(path: string, to: number, duration: number, easing: EasingName = 'linear'): this {
        if (typeof to !== 'number' || !Number.isFinite(to)) {
            throw new Error(`Tween: .to('${path}') needs a finite number target, got ${String(to)}.`);
        }
        if (!(duration > 0)) {
            throw new Error(`Tween: .to('${path}') needs duration > 0.`);
        }
        this.steps.push({ path, to, duration, delay: this.pendingDelay, easing });
        this.pendingDelay = 0;
        return this;
    }

    /** Wait before the next step. */
    delay(seconds: number): this {
        if (seconds < 0) throw new Error('Tween: delay must be >= 0.');
        this.pendingDelay += seconds;
        return this;
    }

    /** Alias for delay. */
    wait(seconds: number): this {
        return this.delay(seconds);
    }

    /** Total iterations (1 = play once, the default). 'infinite' loops forever until kill(). */
    setLoops(count: number | 'infinite'): this {
        if (count !== 'infinite' && (!Number.isInteger(count) || count < 1)) {
            throw new Error('Tween: setLoops needs a positive integer or "infinite".');
        }
        this.loops = count;
        return this;
    }

    onComplete(cb: () => void): this {
        this.completeHandlers.add(cb);
        return this;
    }

    /** Fired with the step index each time a step finishes. */
    onStepComplete(cb: (index: number) => void): this {
        this.stepHandlers.add(cb);
        return this;
    }

    start(): this {
        if (this.steps.length === 0) {
            throw new Error('Tween: start() with no steps — call .to() first.');
        }
        this.stepIndex = 0;
        this.stepElapsed = 0;
        this.stepStarted = false;
        this.loopsDone = 0;
        this.running = true;
        this.finished = false;
        return this;
    }

    pause(): void {
        this.running = false;
    }

    resume(): void {
        if (!this.finished) this.running = true;
    }

    kill(): void {
        this.running = false;
        this.finished = true;
    }

    get isRunning(): boolean {
        return this.running;
    }

    get isFinished(): boolean {
        return this.finished;
    }

    get currentStep(): number {
        return this.stepIndex;
    }

    /** Advance the tween. Returns true while still running. */
    update(dt: number): boolean {
        if (!this.running || this.finished) return this.running;
        let remaining = dt;
        while (remaining > 0 && this.running && !this.finished) {
            const step = this.steps[this.stepIndex];
            if (!this.stepStarted) {
                const from = readPath(this.target, step.path);
                if (typeof from !== 'number') {
                    // Target property missing or not numeric: skip the step rather
                    // than throwing mid-frame and killing the game loop.
                    console.warn(`[Glix] Tween: '${step.path}' is not a number on the target, step skipped.`);
                    this.advanceStep();
                    continue;
                }
                this.stepFrom = from;
                this.stepStarted = true;
            }
            if (step.delay > 0 && this.stepElapsed < step.delay) {
                const used = Math.min(remaining, step.delay - this.stepElapsed);
                this.stepElapsed += used;
                remaining -= used;
                continue;
            }
            const active = this.stepElapsed - step.delay;
            const used = Math.min(remaining, step.duration - active);
            const t = step.duration > 0 ? (active + used) / step.duration : 1;
            writePath(this.target, step.path, lerp(this.stepFrom, step.to, applyEasing(step.easing, t)));
            this.stepElapsed += used;
            remaining -= used;
            if (this.stepElapsed >= step.delay + step.duration) {
                writePath(this.target, step.path, step.to);
                const doneIndex = this.stepIndex;
                this.advanceStep();
                for (const cb of [...this.stepHandlers]) cb(doneIndex);
            }
        }
        return this.running;
    }

    private advanceStep(): void {
        this.stepIndex++;
        this.stepElapsed = 0;
        this.stepStarted = false;
        if (this.stepIndex >= this.steps.length) {
            this.loopsDone++;
            if (this.loops === 'infinite' || this.loopsDone < this.loops) {
                this.stepIndex = 0;
            } else {
                this.running = false;
                this.finished = true;
                for (const cb of [...this.completeHandlers]) cb();
            }
        }
    }
}

/** Steps every live tween once per frame. Own one per Engine (core team wires it in the fixed step). */
export class TweenManager {
    private tweens = new Set<Tween>();

    add(tween: Tween): Tween {
        this.tweens.add(tween);
        return tween;
    }

    remove(tween: Tween): void {
        this.tweens.delete(tween);
    }

    update(dt: number): void {
        for (const tween of [...this.tweens]) {
            tween.update(dt);
            if (tween.isFinished) this.tweens.delete(tween);
        }
    }

    killAll(): void {
        for (const tween of this.tweens) tween.kill();
        this.tweens.clear();
    }

    get count(): number {
        return this.tweens.size;
    }
}
