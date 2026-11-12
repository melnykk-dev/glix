import { Entity } from '@glix/shared';

export interface CollisionEvent {
    entityA: Entity;
    entityB: Entity;
    isSensor: boolean;
}

export type EngineEventMap = {
    collisionEnter: CollisionEvent;
    collisionExit: CollisionEvent;
    [key: string]: any;
};

export type EngineEvent = keyof EngineEventMap | string;
export type Handler<T> = (data: T) => void;

export class EventBus {
    private handlers: { [K in string]?: Set<Handler<any>> } = {};

    /** Subscribe and get an unsubscribe function. */
    on<K extends string>(event: K, handler: Handler<any>): () => void {
        if (!this.handlers[event]) {
            this.handlers[event] = new Set();
        }
        this.handlers[event]!.add(handler);
        return () => this.off(event, handler);
    }

    off<K extends string>(event: K, handler: Handler<any>): void {
        this.handlers[event]?.delete(handler);
    }

    emit<K extends string>(event: K, data: any): void {
        this.handlers[event]?.forEach((handler) => handler(data));
    }

    /** Remove all listeners (called on engine stop). */
    clear(): void {
        this.handlers = {};
    }
}
