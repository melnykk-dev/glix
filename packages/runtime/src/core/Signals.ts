/**
 * Signals for Glix (GODOT_PARITY.md item 44, was PARTIAL — EventBus only).
 *
 * Godot-style signals on top of the existing EventBus. EventBus is left
 * untouched; SignalBus wraps it and adds the discipline scripts need:
 *
 *   const signals = new SignalBus(engine.getEventBus());
 *   signals.define('player_died');                       // declare once
 *   signals.connect('player_died', (p) => ui.showGameOver(p.score));
 *   signals.emit('player_died', { score: 120 });
 *   signals.disconnect('player_died', handler);          // or disconnectAll
 *   signals.disconnectOwner(playerEntity);               // on entity destroy
 *   signals.connectByName('player_died', 'onPlayerDied', myScript);
 *
 * Rules: emitting a signal that was never defined throws a plain-language
 * error (typo protection — the #1 signals bug). Connecting twice with the
 * same handler is a no-op. Handlers are called in connect order; a handler
 * that throws is caught and logged so one bad listener cannot break the
 * emitter or the game loop.
 */
import { EventBus } from './EventBus';

export type SignalHandler<T = any> = (payload: T) => void;

interface SignalConnection {
    name: string;
    handler: SignalHandler;
    wrapped: SignalHandler;
    owner: unknown;
    unsubscribe: () => void;
}

export class SignalBus {
    private readonly bus: EventBus;
    private defined = new Set<string>();
    private connections: SignalConnection[] = [];

    constructor(bus?: EventBus) {
        this.bus = bus ?? new EventBus();
    }

    /** The underlying bus (shared with the Engine when one is passed in). */
    get eventBus(): EventBus {
        return this.bus;
    }

    /** Declare a signal. Idempotent — defining twice is fine (e.g. on reload). */
    define(name: string): void {
        if (!name || typeof name !== 'string') {
            throw new Error('SignalBus: signal name must be a non-empty string.');
        }
        this.defined.add(name);
    }

    isDefined(name: string): boolean {
        return this.defined.has(name);
    }

    listSignals(): string[] {
        return [...this.defined].sort();
    }

    /** Emit a defined signal. Throws a plain error for an undefined signal name. */
    emit<T = any>(name: string, payload?: T): void {
        if (!this.defined.has(name)) {
            throw new Error(
                `SignalBus: cannot emit undefined signal "${name}". ` +
                `Call signals.define("${name}") first — check the spelling.`,
            );
        }
        this.bus.emit(name, payload);
    }

    /**
     * Connect a handler. Returns an unsubscribe function. Connecting the
     * same handler twice to the same signal is a no-op (returns the
     * existing unsubscribe). `owner` tags the connection so
     * disconnectOwner() can drop every handler an entity/script owned.
     */
    connect<T = any>(
        name: string,
        handler: SignalHandler<T>,
        opts: { once?: boolean; owner?: unknown } = {},
    ): () => void {
        if (!this.defined.has(name)) {
            throw new Error(
                `SignalBus: cannot connect to undefined signal "${name}". ` +
                `Call signals.define("${name}") first — check the spelling.`,
            );
        }
        const existing = this.connections.find((c) => c.name === name && c.handler === handler);
        if (existing) return () => this.disconnect(name, handler);

        const wrapped: SignalHandler = (payload: unknown) => {
            try {
                (handler as SignalHandler)(payload);
            } catch (err) {
                console.error(`[Glix] Signal "${name}" handler failed:`, err);
            }
            if (opts.once) this.disconnect(name, handler);
        };
        const unsubscribe = this.bus.on(name, wrapped);
        this.connections.push({ name, handler: handler as SignalHandler, wrapped, owner: opts.owner ?? null, unsubscribe });
        return () => this.disconnect(name, handler);
    }

    /**
     * Connect by method name — the script-facing form. `target[methodName]`
     * must be a function at connect time; throws a plain error otherwise.
     */
    connectByName(name: string, methodName: string, target: Record<string, unknown>): () => void {
        const fn = target[methodName];
        if (typeof fn !== 'function') {
            throw new Error(
                `SignalBus: cannot connect signal "${name}" to "${methodName}" — ` +
                `that method does not exist on the target object.`,
            );
        }
        return this.connect(name, (fn as SignalHandler).bind(target), { owner: target });
    }

    disconnect(name: string, handler: SignalHandler): void {
        const idx = this.connections.findIndex((c) => c.name === name && c.handler === handler);
        if (idx < 0) return;
        const [conn] = this.connections.splice(idx, 1);
        conn.unsubscribe();
    }

    /** Disconnect every handler for one signal, or for all signals when no name is given. */
    disconnectAll(name?: string): void {
        const doomed = name ? this.connections.filter((c) => c.name === name) : [...this.connections];
        for (const conn of doomed) conn.unsubscribe();
        this.connections = name ? this.connections.filter((c) => c.name !== name) : [];
    }

    /** Drop every connection owned by `owner` — call when an entity or script is destroyed. */
    disconnectOwner(owner: unknown): void {
        const doomed = this.connections.filter((c) => c.owner === owner);
        for (const conn of doomed) conn.unsubscribe();
        this.connections = this.connections.filter((c) => c.owner !== owner);
    }

    /** How many handlers are connected (optionally to one signal). */
    connectionCount(name?: string): number {
        return name ? this.connections.filter((c) => c.name === name).length : this.connections.length;
    }
}

/** Create a SignalBus, optionally wrapping an existing EventBus (e.g. the Engine's). */
export function createSignalBus(bus?: EventBus): SignalBus {
    return new SignalBus(bus);
}
