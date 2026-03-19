import * as planck from 'planck';
import { Entity } from '@glix/shared';
import { World } from '../core/World';
import { EventBus } from '../core/EventBus';

export class PhysicsSystem {
    private pWorld: planck.World;
    private bodies: Map<Entity, planck.Body> = new Map();
    private eventBus: EventBus;
    // Track ground contacts per entity: entity → set of other entity IDs touching from below
    private groundContacts: Map<Entity, Set<Entity>> = new Map();

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.pWorld = new planck.World({
            gravity: planck.Vec2(0, -9.81)
        });

        this.eventBus.on('entityDestroyed', (entity: Entity) => {
            const body = this.bodies.get(entity);
            if (body) {
                this.pWorld.destroyBody(body);
                this.bodies.delete(entity);
                this.groundContacts.delete(entity);
            }
        });

        this.setupCollisionHandlers();
    }

    private setupCollisionHandlers() {
        this.pWorld.on('begin-contact', (contact) => {
            const fixtureA = contact.getFixtureA();
            const fixtureB = contact.getFixtureB();
            const bodyA = fixtureA.getBody();
            const bodyB = fixtureB.getBody();

            const entityA = bodyA.getUserData() as Entity;
            const entityB = bodyB.getUserData() as Entity;

            if (entityA && entityB) {
                this.eventBus.emit('collisionEnter', {
                    entityA,
                    entityB,
                    isSensor: fixtureA.isSensor() || fixtureB.isSensor()
                });

                // Track ground contacts (if normal points from A to B and normal.y > 0.5, B is supported by A)
                const worldManifold = contact.getWorldManifold(null);
                const normal = worldManifold ? worldManifold.normal : contact.getManifold().localNormal;
                if (normal.y > 0.5) {
                    if (!this.groundContacts.has(entityB)) this.groundContacts.set(entityB, new Set());
                    this.groundContacts.get(entityB)!.add(entityA);
                } else if (normal.y < -0.5) {
                    if (!this.groundContacts.has(entityA)) this.groundContacts.set(entityA, new Set());
                    this.groundContacts.get(entityA)!.add(entityB);
                }
            }
        });

        this.pWorld.on('end-contact', (contact) => {
            const fixtureA = contact.getFixtureA();
            const fixtureB = contact.getFixtureB();
            const bodyA = fixtureA.getBody();
            const bodyB = fixtureB.getBody();

            const entityA = bodyA.getUserData() as Entity;
            const entityB = bodyB.getUserData() as Entity;

            if (entityA && entityB) {
                this.eventBus.emit('collisionExit', {
                    entityA,
                    entityB,
                    isSensor: fixtureA.isSensor() || fixtureB.isSensor()
                });

                // Remove ground contact tracking
                this.groundContacts.get(entityA)?.delete(entityB);
                this.groundContacts.get(entityB)?.delete(entityA);
            }
        });
    }

    update(world: World, dt: number): void {
        const entitiesWithPhysics = world.getEntitiesWithComponents('rigidBody');

        // 1. Sync bodies (Create/Destroy/Update)
        this.syncBodies(world, entitiesWithPhysics);

        // 2. Step World
        this.pWorld.step(dt);

        // 3. Sync back to Transform
        this.syncTransforms(world, entitiesWithPhysics);
    }

    private syncBodies(world: any, entities: Entity[]): void {
        const currentEntities = new Set(entities);

        // Remove bodies for entities that no longer have a RigidBody component or are gone
        for (const [entity, body] of this.bodies.entries()) {
            if (!currentEntities.has(entity)) {
                this.pWorld.destroyBody(body);
                this.bodies.delete(entity);
                this.groundContacts.delete(entity);
            }
        }

        // Create or update bodies for existing entities
        for (const entity of entities) {
            const rb = world.getComponent(entity, 'rigidBody');
            const transform = world.getComponent(entity, 'transform');

            if (!rb || !transform) continue;

            if (!this.bodies.has(entity)) {
                // Create body
                const bodyDef: planck.BodyDef = {
                    type: rb.type as planck.BodyType,
                    position: planck.Vec2(transform.x, transform.y),
                    linearDamping: rb.linearDamping,
                    angularDamping: rb.angularDamping,
                    fixedRotation: rb.fixedRotation,
                    gravityScale: rb.gravityScale,
                    userData: entity,
                };

                const body = this.pWorld.createBody(bodyDef);

                // Add fixture
                const boxCollider = world.getComponent(entity, 'boxCollider');
                const circleCollider = world.getComponent(entity, 'circleCollider');

                if (boxCollider) {
                    const shape = planck.Box(
                        (boxCollider.width * (transform.scaleX || 1)) / 2,
                        (boxCollider.height * (transform.scaleY || 1)) / 2,
                        planck.Vec2(boxCollider.offsetX, boxCollider.offsetY)
                    );
                    body.createFixture({
                        shape,
                        isSensor: boxCollider.isSensor,
                        restitution: boxCollider.restitution,
                        friction: boxCollider.friction,
                    });
                } else if (circleCollider) {
                    const shape = planck.Circle(
                        planck.Vec2(circleCollider.offsetX, circleCollider.offsetY),
                        circleCollider.radius * Math.max(transform.scaleX || 1, transform.scaleY || 1)
                    );
                    body.createFixture({
                        shape,
                        isSensor: circleCollider.isSensor,
                        restitution: circleCollider.restitution,
                        friction: circleCollider.friction,
                    });
                } else {
                    // Default fixture
                    body.createFixture({ shape: planck.Box(0.5, 0.5) });
                }

                this.bodies.set(entity, body);
            }
        }
    }

    private syncTransforms(world: any, entities: Entity[]): void {
        for (const entity of entities) {
            const body = this.bodies.get(entity);
            const transform = world.getComponent(entity, 'transform');
            const rb = world.getComponent(entity, 'rigidBody');

            if (body && transform && rb && rb.type === 'dynamic') {
                const pos = body.getPosition();
                transform.x = pos.x;
                transform.y = pos.y;
                transform.rotation = body.getAngle();
            }
        }
    }

    getPlanckWorld(): planck.World {
        return this.pWorld;
    }

    applyForce(entity: Entity, x: number, y: number): void {
        const body = this.bodies.get(entity);
        if (body) {
            body.applyForceToCenter(planck.Vec2(x, y));
        }
    }

    setVelocity(entity: Entity, x: number, y: number): void {
        const body = this.bodies.get(entity);
        if (body) {
            body.setLinearVelocity(planck.Vec2(x, y));
        }
    }

    /** Returns current linear velocity of the physics body, or {x:0, y:0}. */
    getVelocity(entity: Entity): { x: number; y: number } {
        const body = this.bodies.get(entity);
        if (!body) return { x: 0, y: 0 };
        const v = body.getLinearVelocity();
        return { x: v.x, y: v.y };
    }

    /**
     * Returns true when the entity has at least one active ground contact
     * (a collider touching from below). Falls back to velocity heuristic.
     */
    isGrounded(entity: Entity): boolean {
        const contacts = this.groundContacts.get(entity);
        if (contacts && contacts.size > 0) return true;

        // Fallback: vertical velocity is ~0 and body is not free-falling
        const body = this.bodies.get(entity);
        if (!body) return false;
        const v = body.getLinearVelocity();
        return Math.abs(v.y) < 0.15;
    }

    teleport(entity: Entity, x: number, y: number): void {
        const body = this.bodies.get(entity);
        if (body) {
            body.setPosition(planck.Vec2(x, y));
        }
    }

    setGravity(x: number, y: number): void {
        this.pWorld.setGravity(planck.Vec2(x, y));
    }
}
