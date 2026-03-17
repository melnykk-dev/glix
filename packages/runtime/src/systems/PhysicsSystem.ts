import * as planck from 'planck';
import { Entity } from '@glix/shared';
import { World } from '../core/World';
import { EventBus } from '../core/EventBus';

export class PhysicsSystem {
    private pWorld: planck.World;
    private bodies: Map<Entity, planck.Body> = new Map();
    private eventBus: EventBus;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.pWorld = new planck.World({
            gravity: planck.Vec2(0, -9.81)
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
            }
        });
    }

    update(world: World, dt: number): void {
        const entitiesWithPhysics = world.getEntitiesWithComponents('rigidBody');

        // 1. Sync bodies (Create/Destroy/Update)
        this.syncBodies(world, entitiesWithPhysics);

        // 2. Step World
        // Planck uses seconds for dt
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
            }
        }

        // Create or Update bodies
        for (const entity of entities) {
            const rb = world.getComponent(entity, 'rigidBody');
            const transform = world.getComponent(entity, 'transform');
            if (!rb || !transform) continue;

            let body = this.bodies.get(entity);
            if (!body) {
                body = this.pWorld.createBody({
                    type: rb.type,
                    position: planck.Vec2(transform.x, transform.y),
                    angle: transform.rotation,
                    linearDamping: rb.linearDamping,
                    angularDamping: rb.angularDamping,
                    gravityScale: rb.gravityScale,
                    fixedRotation: rb.fixedRotation,
                });
                body.setUserData(entity);
                this.bodies.set(entity, body);
            } else {
                // Update body properties if changed (could be optimized with dirty flags)
                body.setType(rb.type);
                body.setLinearDamping(rb.linearDamping);
                body.setAngularDamping(rb.angularDamping);
                body.setGravityScale(rb.gravityScale);
                body.setFixedRotation(rb.fixedRotation);

                // If static, we might want to sync transform to body if it was moved manualy in editor
                if (rb.type !== 'dynamic') {
                    body.setPosition(planck.Vec2(transform.x, transform.y));
                    body.setAngle(transform.rotation);
                }
            }

            // Sync Colliders (simplified: remove all fixtures and re-add)
            // In a real engine, we'd check if colliders changed
            this.syncColliders(world, entity, body);
        }
    }

    private syncColliders(world: any, entity: Entity, body: planck.Body): void {
        const box = world.getComponent(entity, 'boxCollider');
        const circle = world.getComponent(entity, 'circleCollider');

        // Clear existing fixtures
        let f = body.getFixtureList();
        while (f) {
            const next = f.getNext();
            body.destroyFixture(f);
            f = next;
        }

        if (box) {
            body.createFixture({
                shape: planck.Box(box.width / 2, box.height / 2, planck.Vec2(box.offsetX, box.offsetY)),
                isSensor: box.isSensor,
                restitution: box.restitution,
                friction: box.friction,
            });
        }

        if (circle) {
            body.createFixture({
                shape: planck.Circle(planck.Vec2(circle.offsetX, circle.offsetY), circle.radius),
                isSensor: circle.isSensor,
                restitution: circle.restitution,
                friction: circle.friction,
            });
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
}
