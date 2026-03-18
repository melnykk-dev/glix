import { Entity, ComponentType, ComponentMap } from '@glix/shared';

/**
 * Manages entities and their components.
 */
export class World {
    private entities: Set<Entity> = new Set();
    private names: Map<Entity, string> = new Map();
    private components: { [K in ComponentType]?: Map<Entity, ComponentMap[K]> } = {};
    private nextEntityId = 0;

    createEntity(id?: Entity): Entity {
        if (!id) {
            id = `entity_${this.nextEntityId++}`;
        } else {
            // Keep nextEntityId in sync if we provide a higher ID manually
            const match = id.match(/entity_(\d+)/);
            if (match) {
                const num = parseInt(match[1]);
                if (num >= this.nextEntityId) {
                    this.nextEntityId = num + 1;
                }
            }
        }
        this.entities.add(id);
        return id;
    }

    removeEntity(entity: Entity): void {
        this.entities.delete(entity);
        this.names.delete(entity);
        for (const type in this.components) {
            this.components[type as ComponentType]?.delete(entity);
        }
    }

    addComponent<K extends ComponentType>(entity: Entity, type: K, component: ComponentMap[K]): void {
        if (!this.components[type]) {
            this.components[type] = new Map();
        }
        this.components[type]!.set(entity, component);
    }

    getComponent<K extends ComponentType>(entity: Entity, type: K): ComponentMap[K] | undefined {
        return this.components[type]?.get(entity);
    }

    removeComponent(entity: Entity, type: ComponentType): void {
        this.components[type]?.delete(entity);
    }

    getEntityComponents(entity: Entity): Partial<ComponentMap> {
        const result: Partial<ComponentMap> = {};
        for (const type in this.components) {
            const compType = type as ComponentType;
            const comp = this.components[compType]?.get(entity);
            if (comp) {
                (result as any)[compType] = comp;
            }
        }
        return result;
    }

    getEntitiesWithComponents<K extends ComponentType>(...types: K[]): Entity[] {
        if (types.length === 0) return Array.from(this.entities);

        const result: Entity[] = [];
        for (const entity of this.entities) {
            const hasAll = types.every((type) => this.components[type]?.has(entity));
            if (hasAll) {
                result.push(entity);
            }
        }
        return result;
    }

    clear(): void {
        this.entities.clear();
        this.names.clear();
        this.components = {};
        this.nextEntityId = 0;
    }

    setName(entity: Entity, name: string): void {
        this.names.set(entity, name);
    }

    getName(entity: Entity): string | undefined {
        return this.names.get(entity);
    }
}
