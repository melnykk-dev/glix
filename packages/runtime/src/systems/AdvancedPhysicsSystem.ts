import { Vec2, Vec3, Mat4 } from '../math';
import { World } from '../core/World';
import { Entity } from '@glix/shared';

/**
 * Advanced Physics System with joints, advanced collision detection, raycasting,
 * soft bodies, cloth simulation, and destructible objects.
 */
export class AdvancedPhysicsSystem {
    private world: any; // Planck.js world
    private eventBus: any;
    private joints: Map<string, Joint> = new Map();
    private softBodies: Map<string, SoftBody> = new Map();
    private clothSimulations: Map<string, ClothSimulation> = new Map();
    private destructibleObjects: Map<string, DestructibleObject> = new Map();
    private raycastResults: RaycastResult[] = [];
    private collisionCallbacks: Map<string, CollisionCallback[]> = new Map();
    private triggerCallbacks: Map<string, TriggerCallback[]> = new Map();

    // Advanced physics settings
    private gravity: Vec2 = Vec2.fromValues(0, -9.81);
    private timeStep: number = 1/60;
    private velocityIterations: number = 8;
    private positionIterations: number = 3;
    private enableSleeping: boolean = true;
    private enableContinuousCollision: boolean = true;
    private enableWarmStarting: boolean = true;
    private enableSubStepping: boolean = false;

    // Advanced features
    private enableCCD: boolean = true; // Continuous Collision Detection
    private enableTOI: boolean = true; // Time of Impact
    private maxTOI: number = 1.0;
    private enableBullet: boolean = true;
    private enableFriction: boolean = true;
    private enableRestitution: boolean = true;

    // Performance settings
    private broadphaseAlgorithm: 'dynamic' | 'sap' = 'dynamic';
    private maxContacts: number = 2048;
    private maxProxies: number = 1024;
    private maxPairs: number = 8192;

    constructor(eventBus: any) {
        this.eventBus = eventBus;
        this.initializeWorld();
        console.log('[AdvancedPhysicsSystem] Advanced physics system initialized');
    }

    private initializeWorld(): void {
        // Initialize Planck.js world with advanced settings
        this.world = new (window as any).plank.World(this.gravity);

        // Configure advanced physics settings
        this.world.setGravity(this.gravity);
        this.world.setAllowSleeping(this.enableSleeping);
        this.world.setContinuousPhysics(this.enableContinuousCollision);
        this.world.setWarmStarting(this.enableWarmStarting);
        this.world.setSubStepping(this.enableSubStepping);

        // Set up collision event listeners
        this.world.on('begin-contact', this.onBeginContact.bind(this));
        this.world.on('end-contact', this.onEndContact.bind(this));
        this.world.on('pre-solve', this.onPreSolve.bind(this));
        this.world.on('post-solve', this.onPostSolve.bind(this));
    }

    update(world: World, deltaTime: number): void {
        // Update soft bodies
        for (const softBody of this.softBodies.values()) {
            this.updateSoftBody(softBody, deltaTime);
        }

        // Update cloth simulations
        for (const cloth of this.clothSimulations.values()) {
            this.updateClothSimulation(cloth, deltaTime);
        }

        // Update destructible objects
        for (const destructible of this.destructibleObjects.values()) {
            this.updateDestructibleObject(destructible, deltaTime);
        }

        // Step physics world
        this.world.step(this.timeStep, this.velocityIterations, this.positionIterations);

        // Update entity transforms from physics bodies
        this.syncTransforms(world);

        // Clear raycast results
        this.raycastResults.length = 0;
    }

    private syncTransforms(world: World): void {
        // Sync physics body transforms back to entities
        for (const entity of world.getEntitiesWithComponents('rigidBody')) {
            const rigidBody = world.getComponent(entity, 'rigidBody');
            const transform = world.getComponent(entity, 'transform');

            if (rigidBody && transform) {
                const body = this.world.getBodyList();
                while (body) {
                    if ((body as any).entityId === entity) {
                        const position = body.getPosition();
                        const angle = body.getAngle();

                        transform.x = position.x;
                        transform.y = position.y;
                        transform.rotation = angle;
                        break;
                    }
                    body = body.getNext();
                }
            }
        }
    }

    // Joint system
    createJoint(type: JointType, entityA: Entity, entityB: Entity, config: JointConfig): string {
        const jointId = `joint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Find physics bodies
        const bodyA = this.findBodyByEntity(entityA);
        const bodyB = this.findBodyByEntity(entityB);

        if (!bodyA || !bodyB) {
            throw new Error(`Cannot create joint: bodies not found for entities ${entityA} and ${entityB}`);
        }

        let joint: any;

        switch (type) {
            case 'revolute':
                joint = this.world.createJoint((window as any).plank.RevoluteJoint({
                    bodyA,
                    bodyB,
                    localAnchorA: config.anchorA || Vec2.fromValues(0, 0),
                    localAnchorB: config.anchorB || Vec2.fromValues(0, 0),
                    referenceAngle: config.referenceAngle || 0,
                    enableMotor: config.enableMotor || false,
                    motorSpeed: config.motorSpeed || 0,
                    maxMotorTorque: config.maxMotorTorque || 0,
                    enableLimit: config.enableLimit || false,
                    lowerAngle: config.lowerAngle || 0,
                    upperAngle: config.upperAngle || 0
                }));
                break;

            case 'distance':
                joint = this.world.createJoint((window as any).plank.DistanceJoint({
                    bodyA,
                    bodyB,
                    localAnchorA: config.anchorA || Vec2.fromValues(0, 0),
                    localAnchorB: config.anchorB || Vec2.fromValues(0, 0),
                    length: config.length || 1,
                    frequency: config.frequency || 0,
                    dampingRatio: config.dampingRatio || 0
                }));
                break;

            case 'prismatic':
                joint = this.world.createJoint((window as any).plank.PrismaticJoint({
                    bodyA,
                    bodyB,
                    localAnchorA: config.anchorA || Vec2.fromValues(0, 0),
                    localAnchorB: config.anchorB || Vec2.fromValues(0, 0),
                    localAxisA: config.axis || Vec2.fromValues(1, 0),
                    referenceAngle: config.referenceAngle || 0,
                    enableMotor: config.enableMotor || false,
                    motorSpeed: config.motorSpeed || 0,
                    maxMotorForce: config.maxMotorForce || 0,
                    enableLimit: config.enableLimit || false,
                    lowerTranslation: config.lowerTranslation || 0,
                    upperTranslation: config.upperTranslation || 0
                }));
                break;

            case 'weld':
                joint = this.world.createJoint((window as any).plank.WeldJoint({
                    bodyA,
                    bodyB,
                    localAnchorA: config.anchorA || Vec2.fromValues(0, 0),
                    localAnchorB: config.anchorB || Vec2.fromValues(0, 0),
                    referenceAngle: config.referenceAngle || 0,
                    frequency: config.frequency || 0,
                    dampingRatio: config.dampingRatio || 0
                }));
                break;

            case 'wheel':
                joint = this.world.createJoint((window as any).plank.WheelJoint({
                    bodyA,
                    bodyB,
                    localAnchorA: config.anchorA || Vec2.fromValues(0, 0),
                    localAnchorB: config.anchorB || Vec2.fromValues(0, 0),
                    localAxisA: config.axis || Vec2.fromValues(1, 0),
                    enableMotor: config.enableMotor || false,
                    motorSpeed: config.motorSpeed || 0,
                    maxMotorTorque: config.maxMotorTorque || 0,
                    frequency: config.frequency || 2,
                    dampingRatio: config.dampingRatio || 0.7
                }));
                break;

            case 'rope':
                joint = this.world.createJoint((window as any).plank.RopeJoint({
                    bodyA,
                    bodyB,
                    localAnchorA: config.anchorA || Vec2.fromValues(0, 0),
                    localAnchorB: config.anchorB || Vec2.fromValues(0, 0),
                    maxLength: config.maxLength || 1
                }));
                break;

            case 'motor':
                joint = this.world.createJoint((window as any).plank.MotorJoint({
                    bodyA,
                    bodyB,
                    linearOffset: config.linearOffset || Vec2.fromValues(0, 0),
                    angularOffset: config.angularOffset || 0,
                    maxForce: config.maxForce || 1,
                    maxTorque: config.maxTorque || 1,
                    correctionFactor: config.correctionFactor || 0.3
                }));
                break;
        }

        const physicsJoint: Joint = {
            id: jointId,
            type,
            entityA,
            entityB,
            joint,
            config,
            isBroken: false,
            breakForce: config.breakForce || Infinity,
            breakTorque: config.breakTorque || Infinity
        };

        this.joints.set(jointId, physicsJoint);
        console.log(`[AdvancedPhysicsSystem] Created ${type} joint: ${jointId}`);

        return jointId;
    }

    removeJoint(jointId: string): void {
        const physicsJoint = this.joints.get(jointId);
        if (!physicsJoint) return;

        this.world.destroyJoint(physicsJoint.joint);
        this.joints.delete(jointId);
        console.log(`[AdvancedPhysicsSystem] Removed joint: ${jointId}`);
    }

    // Soft body system
    createSoftBody(config: SoftBodyConfig): string {
        const softBodyId = `softbody_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const particles: SoftBodyParticle[] = [];
        const springs: SoftBodySpring[] = [];

        // Create particles grid
        for (let y = 0; y < config.height; y++) {
            for (let x = 0; x < config.width; x++) {
                const particle: SoftBodyParticle = {
                    position: Vec2.fromValues(
                        config.position[0] + x * config.spacing,
                        config.position[1] + y * config.spacing
                    ),
                    velocity: Vec2.fromValues(0, 0),
                    force: Vec2.fromValues(0, 0),
                    mass: config.particleMass,
                    radius: config.particleRadius,
                    fixed: (x === 0 && y === 0) || (x === config.width - 1 && y === 0) // Fix corners
                };
                particles.push(particle);
            }
        }

        // Create springs between adjacent particles
        for (let y = 0; y < config.height; y++) {
            for (let x = 0; x < config.width; x++) {
                const index = y * config.width + x;

                // Horizontal springs
                if (x < config.width - 1) {
                    springs.push({
                        particleA: index,
                        particleB: index + 1,
                        restLength: config.spacing,
                        stiffness: config.stiffness,
                        damping: config.damping
                    });
                }

                // Vertical springs
                if (y < config.height - 1) {
                    springs.push({
                        particleA: index,
                        particleB: index + config.width,
                        restLength: config.spacing,
                        stiffness: config.stiffness,
                        damping: config.damping
                    });
                }

                // Diagonal springs for stability
                if (x < config.width - 1 && y < config.height - 1) {
                    const diagonalLength = config.spacing * Math.sqrt(2);
                    springs.push({
                        particleA: index,
                        particleB: index + config.width + 1,
                        restLength: diagonalLength,
                        stiffness: config.stiffness * 0.5,
                        damping: config.damping
                    });
                }
            }
        }

        const softBody: SoftBody = {
            id: softBodyId,
            particles,
            springs,
            config,
            triangles: this.generateTriangles(config.width, config.height)
        };

        this.softBodies.set(softBodyId, softBody);
        console.log(`[AdvancedPhysicsSystem] Created soft body: ${softBodyId}`);

        return softBodyId;
    }

    private generateTriangles(width: number, height: number): number[][] {
        const triangles: number[][] = [];

        for (let y = 0; y < height - 1; y++) {
            for (let x = 0; x < width - 1; x++) {
                const topLeft = y * width + x;
                const topRight = y * width + x + 1;
                const bottomLeft = (y + 1) * width + x;
                const bottomRight = (y + 1) * width + x + 1;

                // Two triangles per quad
                triangles.push([topLeft, bottomLeft, topRight]);
                triangles.push([topRight, bottomLeft, bottomRight]);
            }
        }

        return triangles;
    }

    private updateSoftBody(softBody: SoftBody, deltaTime: number): void {
        // Apply gravity to all particles
        for (const particle of softBody.particles) {
            if (!particle.fixed) {
                Vec2.add(particle.force, particle.force, Vec2.fromValues(0, -9.81 * particle.mass));
            }
        }

        // Apply spring forces
        for (const spring of softBody.springs) {
            const particleA = softBody.particles[spring.particleA];
            const particleB = softBody.particles[spring.particleB];

            const delta = Vec2.create();
            Vec2.subtract(delta, particleB.position, particleA.position);
            const distance = Vec2.length(delta);

            if (distance > 0) {
                const force = (distance - spring.restLength) * spring.stiffness;
                Vec2.normalize(delta, delta);
                Vec2.scale(delta, delta, force);

                if (!particleA.fixed) {
                    Vec2.add(particleA.force, particleA.force, delta);
                }
                if (!particleB.fixed) {
                    Vec2.subtract(particleB.force, particleB.force, delta);
                }
            }
        }

        // Integrate forces
        for (const particle of softBody.particles) {
            if (particle.fixed) continue;

            // Verlet integration for stability
            const acceleration = Vec2.create();
            Vec2.scale(acceleration, particle.force, 1 / particle.mass);

            Vec2.scale(acceleration, acceleration, deltaTime * deltaTime);
            Vec2.add(particle.position, particle.position, acceleration);

            // Damping
            Vec2.scale(particle.velocity, particle.velocity, 0.99);

            // Reset force
            Vec2.set(particle.force, 0, 0);
        }

        // Handle collisions with rigid bodies
        this.handleSoftBodyCollisions(softBody);
    }

    private handleSoftBodyCollisions(softBody: SoftBody): void {
        for (const particle of softBody.particles) {
            // Raycast to check for collisions
            const result = this.raycast(particle.position[0], particle.position[1], 0, -1, 1);
            if (result.hit) {
                // Push particle away from collision
                const normal = Vec2.fromValues(result.normalX, result.normalY);
                Vec2.scale(normal, normal, 0.1);
                Vec2.add(particle.position, particle.position, normal);
            }
        }
    }

    // Cloth simulation
    createCloth(config: ClothConfig): string {
        const clothId = `cloth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const particles: ClothParticle[] = [];
        const constraints: ClothConstraint[] = [];

        // Create particle grid
        for (let y = 0; y < config.height; y++) {
            for (let x = 0; x < config.width; x++) {
                const particle: ClothParticle = {
                    position: Vec2.fromValues(
                        config.position[0] + x * config.spacing,
                        config.position[1] - y * config.spacing
                    ),
                    previousPosition: Vec2.fromValues(
                        config.position[0] + x * config.spacing,
                        config.position[1] - y * config.spacing
                    ),
                    velocity: Vec2.fromValues(0, 0),
                    acceleration: Vec2.fromValues(0, 0),
                    mass: config.particleMass,
                    fixed: (y === 0 && (x === 0 || x === config.width - 1)) // Fix top corners
                };
                particles.push(particle);
            }
        }

        // Create distance constraints
        for (let y = 0; y < config.height; y++) {
            for (let x = 0; x < config.width; x++) {
                const index = y * config.width + x;

                // Structural constraints (horizontal and vertical)
                if (x < config.width - 1) {
                    constraints.push({
                        particleA: index,
                        particleB: index + 1,
                        restLength: config.spacing,
                        stiffness: config.structuralStiffness
                    });
                }

                if (y < config.height - 1) {
                    constraints.push({
                        particleA: index,
                        particleB: index + config.width,
                        restLength: config.spacing,
                        stiffness: config.structuralStiffness
                    });
                }

                // Shear constraints (diagonal)
                if (x < config.width - 1 && y < config.height - 1) {
                    constraints.push({
                        particleA: index,
                        particleB: index + config.width + 1,
                        restLength: config.spacing * Math.sqrt(2),
                        stiffness: config.shearStiffness
                    });

                    constraints.push({
                        particleA: index + 1,
                        particleB: index + config.width,
                        restLength: config.spacing * Math.sqrt(2),
                        stiffness: config.shearStiffness
                    });
                }

                // Bend constraints (every other particle)
                if (x < config.width - 2) {
                    constraints.push({
                        particleA: index,
                        particleB: index + 2,
                        restLength: config.spacing * 2,
                        stiffness: config.bendStiffness
                    });
                }

                if (y < config.height - 2) {
                    constraints.push({
                        particleA: index,
                        particleB: index + config.width * 2,
                        restLength: config.spacing * 2,
                        stiffness: config.bendStiffness
                    });
                }
            }
        }

        const cloth: ClothSimulation = {
            id: clothId,
            particles,
            constraints,
            config,
            triangles: this.generateTriangles(config.width, config.height)
        };

        this.clothSimulations.set(clothId, cloth);
        console.log(`[AdvancedPhysicsSystem] Created cloth simulation: ${clothId}`);

        return clothId;
    }

    private updateClothSimulation(cloth: ClothSimulation, deltaTime: number): void {
        // Apply gravity and external forces
        for (const particle of cloth.particles) {
            if (!particle.fixed) {
                Vec2.add(particle.acceleration, particle.acceleration, Vec2.fromValues(0, -9.81));
                // Add wind force
                Vec2.add(particle.acceleration, particle.acceleration,
                        Vec2.fromValues(Math.sin(performance.now() * 0.001) * 0.1, 0));
            }
        }

        // Verlet integration
        for (const particle of cloth.particles) {
            if (particle.fixed) continue;

            const temp = Vec2.clone(particle.position);
            Vec2.subtract(particle.velocity, particle.position, particle.previousPosition);
            Vec2.copy(particle.previousPosition, temp);

            Vec2.scale(particle.acceleration, particle.acceleration, deltaTime * deltaTime);
            Vec2.add(particle.position, particle.position, particle.velocity);
            Vec2.add(particle.position, particle.position, particle.acceleration);

            Vec2.set(particle.acceleration, 0, 0);
        }

        // Satisfy constraints
        for (let iteration = 0; iteration < cloth.config.constraintIterations; iteration++) {
            for (const constraint of cloth.constraints) {
                const particleA = cloth.particles[constraint.particleA];
                const particleB = cloth.particles[constraint.particleB];

                const delta = Vec2.create();
                Vec2.subtract(delta, particleB.position, particleA.position);
                const distance = Vec2.length(delta);

                if (distance > 0) {
                    const difference = (distance - constraint.restLength) / distance;
                    const correction = Vec2.create();
                    Vec2.scale(correction, delta, difference * 0.5 * constraint.stiffness);

                    if (!particleA.fixed) {
                        Vec2.add(particleA.position, particleA.position, correction);
                    }
                    if (!particleB.fixed) {
                        Vec2.subtract(particleB.position, particleB.position, correction);
                    }
                }
            }
        }

        // Handle collisions
        this.handleClothCollisions(cloth);
    }

    private handleClothCollisions(cloth: ClothSimulation): void {
        for (const particle of cloth.particles) {
            // Check collision with ground
            if (particle.position[1] < cloth.config.groundY) {
                particle.position[1] = cloth.config.groundY;
                particle.velocity[1] *= -cloth.config.bounce;
            }

            // Check collision with spheres (for complex obstacles)
            for (const sphere of cloth.config.collisionSpheres || []) {
                const delta = Vec2.create();
                Vec2.subtract(delta, particle.position, sphere.center);
                const distance = Vec2.length(delta);

                if (distance < sphere.radius) {
                    const normal = Vec2.create();
                    Vec2.normalize(normal, delta);
                    Vec2.scale(normal, normal, sphere.radius - distance);
                    Vec2.add(particle.position, particle.position, normal);
                }
            }
        }
    }

    // Destructible objects
    createDestructibleObject(config: DestructibleObjectConfig): string {
        const destructibleId = `destructible_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const chunks: DestructibleChunk[] = [];

        // Generate chunks based on destructible pattern
        for (let i = 0; i < config.chunkCount; i++) {
            const angle = (i / config.chunkCount) * Math.PI * 2;
            const distance = Math.random() * config.maxRadius;

            const chunk: DestructibleChunk = {
                position: Vec2.fromValues(
                    config.position[0] + Math.cos(angle) * distance,
                    config.position[1] + Math.sin(angle) * distance
                ),
                velocity: Vec2.fromValues(0, 0),
                rotation: Math.random() * Math.PI * 2,
                angularVelocity: (Math.random() - 0.5) * 10,
                size: config.chunkSize * (0.5 + Math.random() * 0.5),
                mass: config.chunkMass,
                active: true,
                lifetime: config.chunkLifetime
            };

            chunks.push(chunk);
        }

        const destructible: DestructibleObject = {
            id: destructibleId,
            chunks,
            config,
            isDestroyed: false,
            destructionTime: 0
        };

        this.destructibleObjects.set(destructibleId, destructible);
        console.log(`[AdvancedPhysicsSystem] Created destructible object: ${destructibleId}`);

        return destructibleId;
    }

    destroyObject(destructibleId: string, impactPoint: Vec2, force: number): void {
        const destructible = this.destructibleObjects.get(destructibleId);
        if (!destructible || destructible.isDestroyed) return;

        destructible.isDestroyed = true;
        destructible.destructionTime = performance.now();

        // Apply explosion force to chunks
        for (const chunk of destructible.chunks) {
            const delta = Vec2.create();
            Vec2.subtract(delta, chunk.position, impactPoint);
            const distance = Vec2.length(delta);

            if (distance > 0) {
                const direction = Vec2.create();
                Vec2.normalize(direction, delta);

                const explosionForce = force / Math.max(distance, 1);
                Vec2.scale(direction, direction, explosionForce / chunk.mass);
                Vec2.add(chunk.velocity, chunk.velocity, direction);

                // Add some random rotation
                chunk.angularVelocity += (Math.random() - 0.5) * 20;
            }
        }

        console.log(`[AdvancedPhysicsSystem] Destroyed object: ${destructibleId}`);
    }

    private updateDestructibleObject(destructible: DestructibleObject, deltaTime: number): void {
        if (!destructible.isDestroyed) return;

        const currentTime = performance.now();
        const elapsed = currentTime - destructible.destructionTime;

        for (const chunk of destructible.chunks) {
            if (!chunk.active) continue;

            // Apply gravity
            Vec2.add(chunk.velocity, chunk.velocity, Vec2.fromValues(0, -9.81 * deltaTime));

            // Update position
            const velocityDelta = Vec2.create();
            Vec2.scale(velocityDelta, chunk.velocity, deltaTime);
            Vec2.add(chunk.position, chunk.position, velocityDelta);

            // Update rotation
            chunk.rotation += chunk.angularVelocity * deltaTime;

            // Apply drag
            Vec2.scale(chunk.velocity, chunk.velocity, 0.99);

            // Check lifetime
            chunk.lifetime -= deltaTime;
            if (chunk.lifetime <= 0) {
                chunk.active = false;
            }

            // Ground collision
            if (chunk.position[1] < 0) {
                chunk.position[1] = 0;
                chunk.velocity[1] *= -0.3;
                chunk.angularVelocity *= 0.8;
            }
        }
    }

    // Advanced raycasting
    raycast(originX: number, originY: number, directionX: number, directionY: number, maxDistance: number): RaycastResult {
        const result: RaycastResult = {
            hit: false,
            pointX: 0,
            pointY: 0,
            normalX: 0,
            normalY: 0,
            fraction: 1,
            entityId: null
        };

        // Planck.js raycast
        this.world.rayCast((fixture: any, point: any, normal: any, fraction: number) => {
            if (fraction < result.fraction) {
                result.hit = true;
                result.pointX = point.x;
                result.pointY = point.y;
                result.normalX = normal.x;
                result.normalY = normal.y;
                result.fraction = fraction;
                result.entityId = fixture.getBody().entityId;
            }
            return result.fraction;
        }, Vec2.fromValues(originX, originY), Vec2.fromValues(originX + directionX * maxDistance, originY + directionY * maxDistance));

        return result;
    }

    multiRaycast(originX: number, originY: number, directionX: number, directionY: number, maxDistance: number): RaycastResult[] {
        const results: RaycastResult[] = [];

        this.world.rayCast((fixture: any, point: any, normal: any, fraction: number) => {
            const result: RaycastResult = {
                hit: true,
                pointX: point.x,
                pointY: point.y,
                normalX: normal.x,
                normalY: normal.y,
                fraction: fraction,
                entityId: fixture.getBody().entityId
            };

            results.push(result);
            return 1; // Continue raycasting
        }, Vec2.fromValues(originX, originY), Vec2.fromValues(originX + directionX * maxDistance, originY + directionY * maxDistance));

        // Sort by fraction
        results.sort((a, b) => a.fraction - b.fraction);

        return results;
    }

    // Area queries
    queryAABB(minX: number, minY: number, maxX: number, maxY: number): Entity[] {
        const entities: Entity[] = [];

        this.world.queryAABB((fixture: any) => {
            const entityId = fixture.getBody().entityId;
            if (entityId && !entities.includes(entityId)) {
                entities.push(entityId);
            }
            return true;
        }, {
            lowerBound: Vec2.fromValues(minX, minY),
            upperBound: Vec2.fromValues(maxX, maxY)
        });

        return entities;
    }

    queryCircle(centerX: number, centerY: number, radius: number): Entity[] {
        const entities: Entity[] = [];

        // Use AABB query with circle bounds
        const aabb = {
            lowerBound: Vec2.fromValues(centerX - radius, centerY - radius),
            upperBound: Vec2.fromValues(centerX + radius, centerY + radius)
        };

        this.world.queryAABB((fixture: any) => {
            const body = fixture.getBody();
            const position = body.getPosition();
            const distance = Math.sqrt((position.x - centerX) ** 2 + (position.y - centerY) ** 2);

            if (distance <= radius) {
                const entityId = body.entityId;
                if (entityId && !entities.includes(entityId)) {
                    entities.push(entityId);
                }
            }
            return true;
        }, aabb);

        return entities;
    }

    // Collision callbacks
    addCollisionCallback(entityId: Entity, callback: CollisionCallback): void {
        if (!this.collisionCallbacks.has(entityId)) {
            this.collisionCallbacks.set(entityId, []);
        }
        this.collisionCallbacks.get(entityId)!.push(callback);
    }

    removeCollisionCallback(entityId: Entity, callback: CollisionCallback): void {
        const callbacks = this.collisionCallbacks.get(entityId);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    addTriggerCallback(entityId: Entity, callback: TriggerCallback): void {
        if (!this.triggerCallbacks.has(entityId)) {
            this.triggerCallbacks.set(entityId, []);
        }
        this.triggerCallbacks.get(entityId)!.push(callback);
    }

    private onBeginContact(contact: any): void {
        const fixtureA = contact.getFixtureA();
        const fixtureB = contact.getFixtureB();

        const entityA = fixtureA.getBody().entityId;
        const entityB = fixtureB.getBody().entityId;

        if (entityA) {
            const callbacks = this.collisionCallbacks.get(entityA);
            if (callbacks) {
                for (const callback of callbacks) {
                    callback.onCollisionEnter(entityB);
                }
            }
        }

        if (entityB) {
            const callbacks = this.collisionCallbacks.get(entityB);
            if (callbacks) {
                for (const callback of callbacks) {
                    callback.onCollisionEnter(entityA);
                }
            }
        }

        this.eventBus.emit('collisionEnter', {
            entityA,
            entityB,
            isSensor: fixtureA.isSensor() || fixtureB.isSensor()
        });
    }

    private onEndContact(contact: any): void {
        const fixtureA = contact.getFixtureA();
        const fixtureB = contact.getFixtureB();

        const entityA = fixtureA.getBody().entityId;
        const entityB = fixtureB.getBody().entityId;

        if (entityA) {
            const callbacks = this.collisionCallbacks.get(entityA);
            if (callbacks) {
                for (const callback of callbacks) {
                    callback.onCollisionExit(entityB);
                }
            }
        }

        if (entityB) {
            const callbacks = this.collisionCallbacks.get(entityB);
            if (callbacks) {
                for (const callback of callbacks) {
                    callback.onCollisionExit(entityA);
                }
            }
        }

        this.eventBus.emit('collisionExit', {
            entityA,
            entityB
        });
    }

    private onPreSolve(contact: any, oldManifold: any): void {
        // Pre-solve collision handling
        const fixtureA = contact.getFixtureA();
        const fixtureB = contact.getFixtureB();

        // Modify contact properties here if needed
        // contact.setEnabled(true);
        // contact.setFriction(0.5);
        // contact.setRestitution(0.3);
    }

    private onPostSolve(contact: any, impulse: any): void {
        // Post-solve collision handling
        const fixtureA = contact.getFixtureA();
        const fixtureB = contact.getFixtureB();

        // Access collision impulse data
        // const normalImpulse = impulse.normalImpulses[0];
        // const tangentImpulse = impulse.tangentImpulses[0];
    }

    // Utility methods
    private findBodyByEntity(entityId: Entity): any {
        let body = this.world.getBodyList();
        while (body) {
            if ((body as any).entityId === entityId) {
                return body;
            }
            body = body.getNext();
        }
        return null;
    }

    teleport(entityId: Entity, x: number, y: number): void {
        const body = this.findBodyByEntity(entityId);
        if (body) {
            body.setPosition(Vec2.fromValues(x, y));
            body.setLinearVelocity(Vec2.fromValues(0, 0));
            body.setAngularVelocity(0);
        }
    }

    applyForce(entityId: Entity, forceX: number, forceY: number, worldX?: number, worldY?: number): void {
        const body = this.findBodyByEntity(entityId);
        if (body) {
            if (worldX !== undefined && worldY !== undefined) {
                body.applyForce(Vec2.fromValues(forceX, forceY), Vec2.fromValues(worldX, worldY));
            } else {
                const center = body.getWorldCenter();
                body.applyForce(Vec2.fromValues(forceX, forceY), center);
            }
        }
    }

    applyImpulse(entityId: Entity, impulseX: number, impulseY: number, worldX?: number, worldY?: number): void {
        const body = this.findBodyByEntity(entityId);
        if (body) {
            if (worldX !== undefined && worldY !== undefined) {
                body.applyLinearImpulse(Vec2.fromValues(impulseX, impulseY), Vec2.fromValues(worldX, worldY));
            } else {
                const center = body.getWorldCenter();
                body.applyLinearImpulse(Vec2.fromValues(impulseX, impulseY), center);
            }
        }
    }

    setVelocity(entityId: Entity, velX: number, velY: number): void {
        const body = this.findBodyByEntity(entityId);
        if (body) {
            body.setLinearVelocity(Vec2.fromValues(velX, velY));
        }
    }

    setAngularVelocity(entityId: Entity, angularVel: number): void {
        const body = this.findBodyByEntity(entityId);
        if (body) {
            body.setAngularVelocity(angularVel);
        }
    }

    // Getters and setters
    setGravity(x: number, y: number): void {
        this.gravity = Vec2.fromValues(x, y);
        this.world.setGravity(this.gravity);
    }

    getGravity(): Vec2 {
        return Vec2.clone(this.gravity);
    }

    setTimeStep(timeStep: number): void {
        this.timeStep = timeStep;
    }

    enableSleeping(enabled: boolean): void {
        this.enableSleeping = enabled;
        this.world.setAllowSleeping(enabled);
    }

    enableContinuousCollision(enabled: boolean): void {
        this.enableContinuousCollision = enabled;
        this.world.setContinuousPhysics(enabled);
    }

    getWorld(): any {
        return this.world;
    }

    getBodyCount(): number {
        return this.world.getBodyCount();
    }

    getJointCount(): number {
        return this.world.getJointCount();
    }

    getContactCount(): number {
        return this.world.getContactCount();
    }

    dispose(): void {
        // Clean up all physics objects
        this.joints.clear();
        this.softBodies.clear();
        this.clothSimulations.clear();
        this.destructibleObjects.clear();
        this.collisionCallbacks.clear();
        this.triggerCallbacks.clear();

        console.log('[AdvancedPhysicsSystem] Disposed');
    }
}

// Type definitions
type JointType = 'revolute' | 'distance' | 'prismatic' | 'weld' | 'wheel' | 'rope' | 'motor';

interface JointConfig {
    anchorA?: Vec2;
    anchorB?: Vec2;
    axis?: Vec2;
    referenceAngle?: number;
    length?: number;
    frequency?: number;
    dampingRatio?: number;
    enableMotor?: boolean;
    motorSpeed?: number;
    maxMotorTorque?: number;
    maxMotorForce?: number;
    enableLimit?: boolean;
    lowerAngle?: number;
    upperAngle?: number;
    lowerTranslation?: number;
    upperTranslation?: number;
    maxLength?: number;
    linearOffset?: Vec2;
    angularOffset?: number;
    maxForce?: number;
    maxTorque?: number;
    correctionFactor?: number;
    breakForce?: number;
    breakTorque?: number;
}

interface Joint {
    id: string;
    type: JointType;
    entityA: Entity;
    entityB: Entity;
    joint: any;
    config: JointConfig;
    isBroken: boolean;
    breakForce: number;
    breakTorque: number;
}

interface SoftBodyConfig {
    position: [number, number];
    width: number;
    height: number;
    spacing: number;
    particleMass: number;
    particleRadius: number;
    stiffness: number;
    damping: number;
}

interface SoftBodyParticle {
    position: Vec2;
    velocity: Vec2;
    force: Vec2;
    mass: number;
    radius: number;
    fixed: boolean;
}

interface SoftBodySpring {
    particleA: number;
    particleB: number;
    restLength: number;
    stiffness: number;
    damping: number;
}

interface SoftBody {
    id: string;
    particles: SoftBodyParticle[];
    springs: SoftBodySpring[];
    config: SoftBodyConfig;
    triangles: number[][];
}

interface ClothConfig {
    position: [number, number];
    width: number;
    height: number;
    spacing: number;
    particleMass: number;
    structuralStiffness: number;
    shearStiffness: number;
    bendStiffness: number;
    constraintIterations: number;
    groundY: number;
    bounce: number;
    collisionSpheres?: { center: Vec2; radius: number }[];
}

interface ClothParticle {
    position: Vec2;
    previousPosition: Vec2;
    velocity: Vec2;
    acceleration: Vec2;
    mass: number;
    fixed: boolean;
}

interface ClothConstraint {
    particleA: number;
    particleB: number;
    restLength: number;
    stiffness: number;
}

interface ClothSimulation {
    id: string;
    particles: ClothParticle[];
    constraints: ClothConstraint[];
    config: ClothConfig;
    triangles: number[][];
}

interface DestructibleObjectConfig {
    position: [number, number];
    chunkCount: number;
    maxRadius: number;
    chunkSize: number;
    chunkMass: number;
    chunkLifetime: number;
}

interface DestructibleChunk {
    position: Vec2;
    velocity: Vec2;
    rotation: number;
    angularVelocity: number;
    size: number;
    mass: number;
    active: boolean;
    lifetime: number;
}

interface DestructibleObject {
    id: string;
    chunks: DestructibleChunk[];
    config: DestructibleObjectConfig;
    isDestroyed: boolean;
    destructionTime: number;
}

interface RaycastResult {
    hit: boolean;
    pointX: number;
    pointY: number;
    normalX: number;
    normalY: number;
    fraction: number;
    entityId: Entity | null;
}

interface CollisionCallback {
    onCollisionEnter(otherEntity: Entity): void;
    onCollisionExit(otherEntity: Entity): void;
}

interface TriggerCallback {
    onTriggerEnter(otherEntity: Entity): void;
    onTriggerExit(otherEntity: Entity): void;
}
