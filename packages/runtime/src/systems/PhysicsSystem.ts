import * as planck from 'planck';
import { Entity } from '@glix/shared';
import { World } from '../core/World';
import { EventBus } from '../core/EventBus';

export class PhysicsSystem {
    private pWorld: planck.World;
    private bodies: Map<Entity, planck.Body> = new Map();
    private eventBus: EventBus;
    private groundContacts: Map<Entity, Set<Entity>> = new Map();
    private pendingVelocities: Map<Entity, planck.Vec2> = new Map();
    private pendingForces: Map<Entity, planck.Vec2> = new Map();
    private pendingImpulses: Map<Entity, planck.Vec2> = new Map();


    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.pWorld = new planck.World({
            gravity: planck.Vec2(0, -9.81)
        });

        this.eventBus.on('entityDestroyed', (entity: Entity) => {
            this.destroyBody(entity);
        });

        this.setupCollisionHandlers();
    }

    private destroyBody(entity: Entity): void {
        const body = this.bodies.get(entity);
        if (body) {
            try { this.pWorld.destroyBody(body); } catch (_) {}
            this.bodies.delete(entity);
            this.groundContacts.delete(entity);
            this.pendingVelocities.delete(entity);
            this.pendingForces.delete(entity);
            this.pendingImpulses.delete(entity);
        }
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

                this.groundContacts.get(entityA)?.delete(entityB);
                this.groundContacts.get(entityB)?.delete(entityA);
            }
        });
    }

    update(world: World, dt: number): void {
        const entitiesWithPhysics = world.getEntitiesWithComponents('rigidBody');
        this.syncBodies(world, entitiesWithPhysics);
        this.pWorld.step(dt);
        this.syncTransforms(world, entitiesWithPhysics);
    }

    private syncBodies(world: any, entities: Entity[]): void {
        const currentEntities = new Set(entities);

        for (const [entity] of this.bodies.entries()) {
            if (!currentEntities.has(entity)) {
                this.destroyBody(entity);
            }
        }

        for (const entity of entities) {
            const rb = world.getComponent(entity, 'rigidBody');
            const transform = world.getComponent(entity, 'transform');

            if (!rb || !transform) continue;

            if (!this.bodies.has(entity)) {
                const bodyDef: planck.BodyDef = {
                    type: rb.type as planck.BodyType,
                    position: planck.Vec2(transform.x, transform.y),
                    linearDamping: rb.linearDamping ?? 0,
                    angularDamping: rb.angularDamping ?? 0,
                    fixedRotation: rb.fixedRotation ?? false,
                    gravityScale: rb.gravityScale ?? 1,
                    userData: entity,
                };

                const body = this.pWorld.createBody(bodyDef);

                const boxCollider = world.getComponent(entity, 'boxCollider');
                const circleCollider = world.getComponent(entity, 'circleCollider');

                if (boxCollider) {
                    const shape = planck.Box(
                        (boxCollider.width * (transform.scaleX || 1)) / 2,
                        (boxCollider.height * (transform.scaleY || 1)) / 2,
                        planck.Vec2(boxCollider.offsetX ?? 0, boxCollider.offsetY ?? 0)
                    );
                    body.createFixture({
                        shape,
                        isSensor: boxCollider.isSensor ?? false,
                        restitution: boxCollider.restitution ?? 0,
                        friction: boxCollider.friction ?? 0.2,
                    });
                } else if (circleCollider) {
                    const shape = planck.Circle(
                        planck.Vec2(circleCollider.offsetX ?? 0, circleCollider.offsetY ?? 0),
                        circleCollider.radius * Math.max(transform.scaleX || 1, transform.scaleY || 1)
                    );
                    body.createFixture({
                        shape,
                        isSensor: circleCollider.isSensor ?? false,
                        restitution: circleCollider.restitution ?? 0,
                        friction: circleCollider.friction ?? 0.2,
                    });
                } else {
                    body.createFixture({ shape: planck.Box(0.5, 0.5) });
                }

                this.bodies.set(entity, body);

                // Apply pending operations
                if (this.pendingVelocities.has(entity)) {
                    body.setLinearVelocity(this.pendingVelocities.get(entity)!);
                    this.pendingVelocities.delete(entity);
                }
                if (this.pendingForces.has(entity)) {
                    body.applyForceToCenter(this.pendingForces.get(entity)!);
                    this.pendingForces.delete(entity);
                }
                if (this.pendingImpulses.has(entity)) {
                    body.applyLinearImpulse(this.pendingImpulses.get(entity)!, body.getWorldCenter());
                    this.pendingImpulses.delete(entity);
                }
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

    reset(): void {
        for (const body of this.bodies.values()) {
            try { this.pWorld.destroyBody(body); } catch (_) {}
        }
        this.bodies.clear();
        this.groundContacts.clear();
    }

    getPlanckWorld(): planck.World {
        return this.pWorld;
    }

    applyForce(entity: Entity, x: number, y: number): void {
        const body = this.bodies.get(entity);
        if (body) {
            body.applyForceToCenter(planck.Vec2(x, y));
        } else {
            this.pendingForces.set(entity, planck.Vec2(x, y));
        }
    }

    applyImpulse(entity: Entity, x: number, y: number): void {
        const body = this.bodies.get(entity);
        if (body) {
            body.applyLinearImpulse(planck.Vec2(x, y), body.getWorldCenter());
        } else {
            this.pendingImpulses.set(entity, planck.Vec2(x, y));
        }
    }

    setVelocity(entity: Entity, x: number, y: number): void {
        const body = this.bodies.get(entity);
        if (body) {
            body.setLinearVelocity(planck.Vec2(x, y));
        } else {
            this.pendingVelocities.set(entity, planck.Vec2(x, y));
        }
    }

    getVelocity(entity: Entity): { x: number; y: number } {
        const body = this.bodies.get(entity);
        if (!body) return { x: 0, y: 0 };
        const v = body.getLinearVelocity();
        return { x: v.x, y: v.y };
    }

    isGrounded(entity: Entity): boolean {
        const contacts = this.groundContacts.get(entity);
        if (contacts && contacts.size > 0) return true;

        const body = this.bodies.get(entity);
        if (!body) return false;
        const v = body.getLinearVelocity();
        // Allow slightly higher vertical velocity for "grounded" state to handle small bumps
        return Math.abs(v.y) < 0.25;
    }

    teleport(entity: Entity, x: number, y: number): void {
        const body = this.bodies.get(entity);
        if (body) body.setPosition(planck.Vec2(x, y));
    }

    setAngularVelocity(entity: Entity, omega: number): void {
        const body = this.bodies.get(entity);
        if (body) body.setAngularVelocity(omega);
    }

    setGravity(x: number, y: number): void {
        this.pWorld.setGravity(planck.Vec2(x, y));
    }

    setBodyType(entity: Entity, type: 'dynamic' | 'static' | 'kinematic'): void {
        const body = this.bodies.get(entity);
        if (body) body.setType(type as planck.BodyType);
    }
}
