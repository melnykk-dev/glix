import { Entity, ComponentType, ComponentMap } from '@glix/shared';

export class World {
    private entities: Set<Entity> = new Set();
    private names: Map<Entity, string> = new Map();
    private tags: Map<Entity, Set<string>> = new Map();
    private components: { [K in ComponentType]?: Map<Entity, ComponentMap[K]> } = {};
    private nextEntityId = 0;

    createEntity(id?: Entity): Entity {
        if (!id) {
            id = `entity_${this.nextEntityId++}`;
        } else {
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
        this.tags.delete(entity);
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
        this.tags.clear();
        this.components = {};
        this.nextEntityId = 0;
    }

    setName(entity: Entity, name: string): void {
        this.names.set(entity, name);
    }

    getName(entity: Entity): string | undefined {
        return this.names.get(entity);
    }

    findEntityByName(name: string): Entity | undefined {
        for (const [entity, entityName] of this.names) {
            if (entityName === name) return entity;
        }
        return undefined;
    }

    findEntitiesWithName(name: string): Entity[] {
        const result: Entity[] = [];
        for (const [entity, entityName] of this.names) {
            if (entityName === name) result.push(entity);
        }
        return result;
    }

    addTag(entity: Entity, tag: string): void {
        if (!this.tags.has(entity)) this.tags.set(entity, new Set());
        this.tags.get(entity)!.add(tag);
    }

    removeTag(entity: Entity, tag: string): void {
        this.tags.get(entity)?.delete(tag);
    }

    hasTag(entity: Entity, tag: string): boolean {
        return this.tags.get(entity)?.has(tag) ?? false;
    }

    findEntitiesWithTag(tag: string): Entity[] {
        const result: Entity[] = [];
        for (const [entity, tagSet] of this.tags) {
            if (tagSet.has(tag)) result.push(entity);
        }
        return result;
    }

    hasEntity(entity: Entity): boolean {
        return this.entities.has(entity);
    }
}
