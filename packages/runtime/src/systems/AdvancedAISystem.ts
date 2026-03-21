import { Vec3 } from '../math';
import { World } from '../core/World';
import { Entity } from '@glix/shared';

/**
 * Advanced AI System with pathfinding, behavior trees, state machines, steering behaviors,
 * decision making, perception systems, and emergent behavior simulation.
 */
export class AdvancedAISystem {
    private agents: Map<string, AIAgent> = new Map();
    private behaviorTrees: Map<string, BehaviorTree> = new Map();
    private stateMachines: Map<string, AIStateMachine> = new Map();
    private steeringBehaviors: Map<string, SteeringBehavior> = new Map();
    private navigationMeshes: Map<string, NavigationMesh> = new Map();
    private perceptionSystems: Map<string, PerceptionSystem> = new Map();
    private decisionMakers: Map<string, DecisionMaker> = new Map();
    private goals: Map<string, AIGoal> = new Map();
    private formations: Map<string, Formation> = new Map();

    private pathfinder: Pathfinder;
    private pathCache: Map<string, Path> = new Map();

    // Performance optimization
    private activeAgents: number = 0;
    private maxAgents: number = 1000;
    private updateFrequency: number = 60; // Updates per second
    private lastUpdateTime: number = 0;

    // Spatial partitioning for efficient queries
    private spatialGrid: SpatialGrid;
    private gridSize: number = 10;

    // Emergent behavior
    private flockingSystems: Map<string, FlockingSystem> = new Map();
    // Learning and adaptation
    private reinforcementLearners: Map<string, ReinforcementLearner> = new Map();
    private behaviorAdaptors: Map<string, BehaviorAdaptor> = new Map();

    // Debug visualization
    private debugMode: boolean = false;
    private debugPaths: Path[] = [];
    private debugGoals: Vec3[] = [];
    private debugPerception: PerceptionDebug[] = [];

    constructor() {
        this.pathfinder = new AStarPathfinder();
        this.spatialGrid = new SpatialGrid(this.gridSize);
        console.log('[AdvancedAISystem] Advanced AI system initialized');
    }

    // Agent management
    createAgent(agentId: string, config: AIAgentConfig): AIAgent {
        if (this.agents.size >= this.maxAgents) {
            console.warn('[AdvancedAISystem] Max agents reached');
            throw new Error('Maximum number of agents reached');
        }

        const agent: AIAgent = {
            id: agentId,
            entityId: config.entityId,
            position: Vec3.fromValues(...config.position),
            velocity: Vec3.fromValues(0, 0, 0),
            orientation: Vec3.fromValues(0, 0, 1),
            speed: config.speed || 5,
            maxSpeed: config.maxSpeed || 10,
            acceleration: config.acceleration || 10,
            angularSpeed: config.angularSpeed || 180,
            radius: config.radius || 1,

            // AI components
            behaviorTree: config.behaviorTree || undefined,
            stateMachine: config.stateMachine || undefined,
            steeringBehaviors: config.steeringBehaviors || [],
            perception: config.perception || this.createDefaultPerception(),
            decisionMaker: (config.decisionMaker as any) || undefined,

            // State
            currentGoal: undefined,
            currentPath: undefined,
            currentTarget: undefined,
            isActive: true,
            isPaused: false,

            // Navigation
            navigationMesh: config.navigationMesh || undefined,
            avoidanceRadius: config.avoidanceRadius || 2,

            // Group behavior
            groupId: config.groupId || undefined,
            formation: (config.formation as any) || undefined,
            formationPosition: config.formationPosition || Vec3.create(),

            // Memory and learning
            memory: new AIMemory(),
            learning: config.learning || undefined,

            // Debug
            debugInfo: {
                pathfindingTime: 0,
                decisionTime: 0,
                perceptionTime: 0,
                lastUpdateTime: 0
            }
        };

        this.agents.set(agentId, agent);
        this.spatialGrid.addAgent(agent);
        this.activeAgents++;

        console.log(`[AdvancedAISystem] Created AI agent: ${agentId}`);
        return agent;
    }

    destroyAgent(agentId: string): void {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        // Remove from spatial grid
        this.spatialGrid.removeAgent(agent);

        // Clear current path and goal
        if (agent.currentPath) {
            this.pathCache.delete(agent.currentPath.id);
        }

        // Remove from group if applicable
        if (agent.groupId) {
            // Remove from formation/group logic
        }

        this.agents.delete(agentId);
        this.activeAgents--;

        console.log(`[AdvancedAISystem] Destroyed AI agent: ${agentId}`);
    }

    // Behavior tree system
    createBehaviorTree(treeId: string, rootNode: BehaviorNode): BehaviorTree {
        const tree: BehaviorTree = {
            id: treeId,
            rootNode,
            blackboard: new Map(),
            runningNodes: new Set(),
            lastExecutionTime: 0
        };

        this.behaviorTrees.set(treeId, tree);
        console.log(`[AdvancedAISystem] Created behavior tree: ${treeId}`);

        return tree;
    }

    executeBehaviorTree(treeId: string, agentId: string, deltaTime: number): BehaviorStatus {
        const tree = this.behaviorTrees.get(treeId);
        const agent = this.agents.get(agentId);

        if (!tree || !agent) return BehaviorStatus.Failure;

        tree.lastExecutionTime = performance.now();
        return this.executeNode(tree.rootNode, agent, tree.blackboard, deltaTime);
    }

    private executeNode(node: BehaviorNode, agent: AIAgent, blackboard: Map<string, any>, deltaTime: number): BehaviorStatus {
        switch (node.type) {
            case 'composite':
                return this.executeCompositeNode(node as CompositeNode, agent, blackboard, deltaTime);
            case 'decorator':
                return this.executeDecoratorNode(node as DecoratorNode, agent, blackboard, deltaTime);
            case 'action':
                return this.executeActionNode(node as ActionNode, agent, blackboard, deltaTime);
            case 'condition':
                return this.executeConditionNode(node as ConditionNode, agent, blackboard);
            default:
                return BehaviorStatus.Failure;
        }
    }

    private executeCompositeNode(node: CompositeNode, agent: AIAgent, blackboard: Map<string, any>, deltaTime: number): BehaviorStatus {
        switch (node.compositeType) {
            case 'sequence':
                for (const child of node.children) {
                    const result = this.executeNode(child, agent, blackboard, deltaTime);
                    if (result === BehaviorStatus.Running) return BehaviorStatus.Running;
                    if (result === BehaviorStatus.Failure) return BehaviorStatus.Failure;
                }
                return BehaviorStatus.Success;

            case 'selector':
                for (const child of node.children) {
                    const result = this.executeNode(child, agent, blackboard, deltaTime);
                    if (result === BehaviorStatus.Running) return BehaviorStatus.Running;
                    if (result === BehaviorStatus.Success) return BehaviorStatus.Success;
                }
                return BehaviorStatus.Failure;

            case 'parallel':
                let runningCount = 0;
                let successCount = 0;
                let failureCount = 0;

                for (const child of node.children) {
                    const result = this.executeNode(child, agent, blackboard, deltaTime);
                    if (result === BehaviorStatus.Running) runningCount++;
                    else if (result === BehaviorStatus.Success) successCount++;
                    else if (result === BehaviorStatus.Failure) failureCount++;
                }

                if (runningCount > 0) return BehaviorStatus.Running;
                if (failureCount > 0) return BehaviorStatus.Failure;
                return BehaviorStatus.Success;

            default:
                return BehaviorStatus.Failure;
        }
    }

    private executeDecoratorNode(node: DecoratorNode, agent: AIAgent, blackboard: Map<string, any>, deltaTime: number): BehaviorStatus {
        const childResult = this.executeNode(node.child, agent, blackboard, deltaTime);

        switch (node.decoratorType) {
            case 'inverter':
                return childResult === BehaviorStatus.Success ? BehaviorStatus.Failure :
                       childResult === BehaviorStatus.Failure ? BehaviorStatus.Success : childResult;

            case 'succeeder':
                return childResult === BehaviorStatus.Running ? BehaviorStatus.Running : BehaviorStatus.Success;

            case 'failer':
                return childResult === BehaviorStatus.Running ? BehaviorStatus.Running : BehaviorStatus.Failure;

            case 'repeater':
                if (childResult === BehaviorStatus.Success) {
                    // Reset and repeat
                    return BehaviorStatus.Running;
                }
                return childResult;

            case 'repeat_until_fail':
                if (childResult === BehaviorStatus.Failure) {
                    return BehaviorStatus.Success;
                }
                return BehaviorStatus.Running;

            case 'timer':
                const timerKey = `timer_${node.id}`;
                let timeLeft = blackboard.get(timerKey) || node.timerDuration;

                if (childResult === BehaviorStatus.Running) {
                    timeLeft -= deltaTime;
                    blackboard.set(timerKey, timeLeft);

                    if (timeLeft <= 0) {
                        blackboard.delete(timerKey);
                        return BehaviorStatus.Failure;
                    }
                } else {
                    blackboard.delete(timerKey);
                }

                return childResult;

            default:
                return childResult;
        }
    }

    private executeActionNode(node: ActionNode, agent: AIAgent, blackboard: Map<string, any>, deltaTime: number): BehaviorStatus {
        switch (node.actionType) {
            case 'move_to':
                return this.actionMoveTo(agent, node.target as Vec3, deltaTime);
            case 'wait':
                return this.actionWait(agent, node.duration as number, blackboard);
            case 'attack':
                return this.actionAttack(agent, node.target as unknown as string);
            case 'flee':
                return this.actionFlee(agent, node.target as Vec3);
            case 'patrol':
                return this.actionPatrol(agent, node.waypoints as Vec3[], blackboard);
            case 'follow':
                return this.actionFollow(agent, node.target as Vec3, node.distance as number);
            case 'wander':
                return this.actionWander(agent, blackboard);
            case 'look_at':
                return this.actionLookAt(agent, node.target as Vec3);
            case 'play_animation':
                return this.actionPlayAnimation(agent, node.animation as string);
            case 'custom':
                return node.customFunction ? node.customFunction(agent, blackboard, deltaTime) : BehaviorStatus.Failure;
            default:
                return BehaviorStatus.Failure;
        }
    }

    private executeConditionNode(node: ConditionNode, agent: AIAgent, blackboard: Map<string, any>): BehaviorStatus {
        switch (node.conditionType) {
            case 'has_target':
                return agent.currentTarget ? BehaviorStatus.Success : BehaviorStatus.Failure;
            case 'in_range':
                return this.conditionInRange(agent, node.target as Vec3, node.range as number);
            case 'can_see':
                return this.conditionCanSee(agent, node.target as Vec3);
            case 'health_above':
                return this.conditionHealthAbove(agent, node.threshold as number);
            case 'time_elapsed':
                return this.conditionTimeElapsed(agent, node.duration as number, blackboard);
            case 'custom':
                return node.customFunction ? (node.customFunction(agent, blackboard) ? BehaviorStatus.Success : BehaviorStatus.Failure) : BehaviorStatus.Failure;
            default:
                return BehaviorStatus.Failure;
        }
    }

    // Action implementations
    private actionMoveTo(agent: AIAgent, target: Vec3, deltaTime: number): BehaviorStatus {
        const distance = Vec3.distance(agent.position, target);

        if (distance < 0.1) {
            Vec3.set(agent.velocity, 0, 0, 0);
            return BehaviorStatus.Success;
        }

        // Calculate direction
        const direction = Vec3.create();
        Vec3.subtract(direction, target, agent.position);
        Vec3.normalize(direction, direction);

        // Apply steering
        Vec3.scale(direction, direction, agent.acceleration * deltaTime);
        Vec3.add(agent.velocity, agent.velocity, direction);

        // Limit speed
        const speed = Vec3.length(agent.velocity);
        if (speed > agent.maxSpeed) {
            Vec3.scale(agent.velocity, agent.velocity, agent.maxSpeed / speed);
        }

        // Update position
        const deltaPos = Vec3.create();
        Vec3.scale(deltaPos, agent.velocity, deltaTime);
        Vec3.add(agent.position, agent.position, deltaPos);

        return BehaviorStatus.Running;
    }

    private actionWait(agent: AIAgent, duration: number, blackboard: Map<string, any>): BehaviorStatus {
        const waitKey = `wait_${agent.id}`;
        let timeLeft = blackboard.get(waitKey) || duration;

        timeLeft -= 1/60; // Assuming 60fps
        blackboard.set(waitKey, timeLeft);

        if (timeLeft <= 0) {
            blackboard.delete(waitKey);
            return BehaviorStatus.Success;
        }

        return BehaviorStatus.Running;
    }

    private actionAttack(agent: AIAgent, target: Entity): BehaviorStatus {
        // Implement attack logic
        console.log(`Agent ${agent.id} attacking ${target}`);
        return BehaviorStatus.Success;
    }

    private actionFlee(agent: AIAgent, threat: Vec3): BehaviorStatus {
        const fleeDirection = Vec3.create();
        Vec3.subtract(fleeDirection, agent.position, threat);
        Vec3.normalize(fleeDirection, fleeDirection);

        const fleeTarget = Vec3.create();
        Vec3.scaleAndAdd(fleeTarget, agent.position, fleeDirection, 10);

        return this.actionMoveTo(agent, fleeTarget, 1/60);
    }

    private actionPatrol(agent: AIAgent, waypoints: Vec3[], blackboard: Map<string, any>): BehaviorStatus {
        const patrolKey = `patrol_${agent.id}`;
        let currentWaypoint = blackboard.get(patrolKey) || 0;

        const target = waypoints[currentWaypoint];
        const result = this.actionMoveTo(agent, target, 1/60);

        if (result === BehaviorStatus.Success) {
            currentWaypoint = (currentWaypoint + 1) % waypoints.length;
            blackboard.set(patrolKey, currentWaypoint);
            return BehaviorStatus.Running;
        }

        return result;
    }

    private actionFollow(agent: AIAgent, target: Vec3, distance: number): BehaviorStatus {
        const currentDistance = Vec3.distance(agent.position, target);

        if (currentDistance > distance) {
            return this.actionMoveTo(agent, target, 1/60);
        }

        return BehaviorStatus.Success;
    }

    private actionWander(agent: AIAgent, blackboard: Map<string, any>): BehaviorStatus {
        const wanderKey = `wander_${agent.id}`;
        let wanderTarget = blackboard.get(wanderKey);

        if (!wanderTarget) {
            // Generate random wander target
            const angle = Math.random() * Math.PI * 2;
            const radius = 5 + Math.random() * 10;
            wanderTarget = Vec3.fromValues(
                agent.position[0] + Math.cos(angle) * radius,
                agent.position[1],
                agent.position[2] + Math.sin(angle) * radius
            );
            blackboard.set(wanderKey, wanderTarget);
        }

        const result = this.actionMoveTo(agent, wanderTarget, 1/60);
        if (result === BehaviorStatus.Success) {
            blackboard.delete(wanderKey);
        }

        return result;
    }

    private actionLookAt(agent: AIAgent, target: Vec3): BehaviorStatus {
        const direction = Vec3.create();
        Vec3.subtract(direction, target, agent.position);
        Vec3.normalize(direction, direction);

        // Smooth rotation towards target
        const currentForward = Vec3.fromValues(0, 0, 1); // Assuming forward is +Z
        const dot = Vec3.dot(currentForward, direction);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

        if (angle > 0.01) {
            const axis = Vec3.create();
            Vec3.cross(axis, currentForward, direction);
            Vec3.normalize(axis, axis);

            // Apply rotation (simplified)
            // const rotationSpeed = agent.angularSpeed * Math.PI / 180 * (1/60);
            // const _rotationAmount = Math.min(rotationSpeed, angle);

            // This would apply the rotation to the agent's orientation
            return BehaviorStatus.Running;
        }

        return BehaviorStatus.Success;
    }

    private actionPlayAnimation(agent: AIAgent, animation: string): BehaviorStatus {
        // Trigger animation playback
        console.log(`Agent ${agent.id} playing animation: ${animation}`);
        return BehaviorStatus.Success;
    }

    // Condition implementations
    private conditionInRange(agent: AIAgent, target: Vec3, range: number): BehaviorStatus {
        const distance = Vec3.distance(agent.position, target);
        return distance <= range ? BehaviorStatus.Success : BehaviorStatus.Failure;
    }

    private conditionCanSee(agent: AIAgent, target: Vec3): BehaviorStatus {
        // Implement line of sight check
        // For now, just check distance
        const distance = Vec3.distance(agent.position, target);
        return distance <= 20 ? BehaviorStatus.Success : BehaviorStatus.Failure;
    }

    private conditionHealthAbove(_agent: AIAgent, _threshold: number): BehaviorStatus {
        // Check agent's health (would need to be stored somewhere)
        return BehaviorStatus.Success; // Placeholder
    }

    private conditionTimeElapsed(agent: AIAgent, duration: number, blackboard: Map<string, any>): BehaviorStatus {
        const timerKey = `timer_${agent.id}`;
        let elapsed = blackboard.get(timerKey) || 0;
        elapsed += 1/60;
        blackboard.set(timerKey, elapsed);

        return elapsed >= duration ? BehaviorStatus.Success : BehaviorStatus.Failure;
    }

    // State machine system
    createStateMachine(smId: string, states: AIState[], transitions: StateTransition[]): AIStateMachine {
        const stateMachine: AIStateMachine = {
            id: smId,
            name: smId,
            states: new Map(states.map(s => [s.name, s])),
            transitions,
            currentState: states[0]?.name || '',
            globalTransitions: [],
            parameters: new Map(),
            lastTransitionTime: 0
        };

        this.stateMachines.set(smId, stateMachine);
        console.log(`[AdvancedAISystem] Created AI state machine: ${smId} (${states.length} states)`);

        return stateMachine;
    }

    updateStateMachine(smId: string, agentId: string, deltaTime: number): void {
        const stateMachine = this.stateMachines.get(smId);
        const agent = this.agents.get(agentId);

        if (!stateMachine || !agent) return;

        const currentState = stateMachine.states.get(stateMachine.currentState);
        if (!currentState) return;

        // Execute current state
        if (currentState.update) {
            currentState.update(agent, deltaTime);
        }

        // Check transitions
        for (const transition of [...stateMachine.transitions, ...stateMachine.globalTransitions]) {
            if (transition.fromState === stateMachine.currentState || transition.fromState === 'any') {
                if (this.evaluateTransition(transition, stateMachine.parameters)) {
                    // Exit current state
                    if (currentState.exit) {
                        currentState.exit(agent);
                    }

                    // Enter new state
                    const newState = stateMachine.states.get(transition.toState);
                    if (newState && newState.enter) {
                        newState.enter(agent);
                    }

                    stateMachine.currentState = transition.toState;
                    stateMachine.lastTransitionTime = performance.now();

                    console.log(`Agent ${agentId} transitioned from ${transition.fromState} to ${transition.toState}`);
                    break;
                }
            }
        }
    }

    private evaluateTransition(transition: StateTransition, parameters: Map<string, any>): boolean {
        for (const condition of (transition as any).conditions) {
            const value = parameters.get(condition.parameter);

            switch (condition.type) {
                case 'bool':
                    if (value !== condition.expectedValue) return false;
                    break;
                case 'number':
                    if (condition.operator === 'equal' && value !== condition.expectedValue) return false;
                    if (condition.operator === 'greater' && value <= condition.expectedValue) return false;
                    if (condition.operator === 'less' && value >= condition.expectedValue) return false;
                    break;
                case 'trigger':
                    if (!condition.triggered) return false;
                    condition.triggered = false;
                    break;
            }
        }

        return true;
    }

    // Pathfinding
    findPath(start: Vec3, end: Vec3, navigationMesh?: string): Path | null {
        const cacheKey = `${start[0]},${start[1]},${start[2]}-${end[0]},${end[1]},${end[2]}`;

        // Check cache first
        if (this.pathCache.has(cacheKey)) {
            return this.pathCache.get(cacheKey)!;
        }

        let navMesh: NavigationMesh | undefined = undefined;
        if (navigationMesh) {
            navMesh = this.navigationMeshes.get(navigationMesh);
        }

        const path = this.pathfinder.findPath(start, end, navMesh);
        if (path) {
            this.pathCache.set(cacheKey, path);
        }

        return path;
    }

    setAgentPath(agentId: string, path: Path): void {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        agent.currentPath = path;
        agent.currentTarget = path.points[0];

        if (this.debugMode) {
            this.debugPaths.push(path);
        }
    }

    updateAgentPathfinding(agent: AIAgent, deltaTime: number): void {
        if (!agent.currentPath || !agent.currentTarget) return;

        const startTime = performance.now();

        // Move towards current target
        const distance = Vec3.distance(agent.position, agent.currentTarget);

        if (distance < 0.5) {
            // Reached current waypoint, move to next
            const currentIndex = agent.currentPath.points.indexOf(agent.currentTarget);
            if (currentIndex < agent.currentPath.points.length - 1) {
                agent.currentTarget = agent.currentPath.points[currentIndex + 1];
            } else {
                // Reached end of path
                agent.currentPath = undefined;
                agent.currentTarget = undefined;
                return;
            }
        }

        // Move towards target
        const direction = Vec3.create();
        Vec3.subtract(direction, agent.currentTarget, agent.position);
        Vec3.normalize(direction, direction);

        Vec3.scale(direction, direction, agent.speed * deltaTime);
        Vec3.add(agent.position, agent.position, direction);

        agent.debugInfo.pathfindingTime = performance.now() - startTime;
    }

    // Navigation mesh
    createNavigationMesh(meshId: string, triangles: Triangle[], bounds: AABB): NavigationMesh {
        const navMesh: NavigationMesh = {
            id: meshId,
            triangles,
            bounds,
            nodes: [],
            edges: []
        };

        // Build navigation graph
        this.buildNavigationGraph(navMesh);

        this.navigationMeshes.set(meshId, navMesh);
        console.log(`[AdvancedAISystem] Created navigation mesh: ${meshId} (${triangles.length} triangles)`);

        return navMesh;
    }

    private buildNavigationGraph(navMesh: NavigationMesh): void {
        // Create nodes at triangle centers
        for (const triangle of navMesh.triangles) {
            const center = this.calculateTriangleCenter(triangle);
            navMesh.nodes.push({
                position: center,
                connections: [],
                cost: 1.0
            });
        }

        // Create edges between adjacent triangles
        for (let i = 0; i < navMesh.triangles.length; i++) {
            for (let j = i + 1; j < navMesh.triangles.length; j++) {
                if (this.trianglesAreAdjacent(navMesh.triangles[i], navMesh.triangles[j])) {
                    const distance = Vec3.distance(navMesh.nodes[i].position, navMesh.nodes[j].position);
                    navMesh.edges.push({
                        from: i,
                        to: j,
                        cost: distance
                    });

                    navMesh.nodes[i].connections.push(j);
                    navMesh.nodes[j].connections.push(i);
                }
            }
        }
    }

    private calculateTriangleCenter(triangle: Triangle): Vec3 {
        const center = Vec3.create();
        Vec3.add(center, triangle.v1, triangle.v2);
        Vec3.add(center, center, triangle.v3);
        Vec3.scale(center, center, 1/3);
        return center;
    }

    private trianglesAreAdjacent(t1: Triangle, t2: Triangle): boolean {
        // Check if triangles share an edge
        const edges1 = [
            [t1.v1, t1.v2], [t1.v2, t1.v3], [t1.v3, t1.v1]
        ];
        const edges2 = [
            [t2.v1, t2.v2], [t2.v2, t2.v3], [t2.v3, t2.v1]
        ];

        for (const edge1 of edges1) {
            for (const edge2 of edges2) {
                if (this.edgesEqual(edge1, edge2)) {
                    return true;
                }
            }
        }

        return false;
    }

    private edgesEqual(edge1: Vec3[], edge2: Vec3[]): boolean {
        return (Vec3.equals(edge1[0], edge2[0]) && Vec3.equals(edge1[1], edge2[1])) ||
               (Vec3.equals(edge1[0], edge2[1]) && Vec3.equals(edge1[1], edge2[0]));
    }

    // Steering behaviors
    addSteeringBehavior(agentId: string, behavior: SteeringBehavior): void {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        agent.steeringBehaviors.push(behavior);
        this.steeringBehaviors.set(`${agentId}_${behavior.type}`, behavior);
    }

    removeSteeringBehavior(agentId: string, behaviorType: string): void {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        agent.steeringBehaviors = agent.steeringBehaviors.filter(b => b.type !== behaviorType);
        this.steeringBehaviors.delete(`${agentId}_${behaviorType}`);
    }

    calculateSteering(agent: AIAgent, _deltaTime: number): Vec3 {
        const totalForce = Vec3.create();

        for (const behavior of agent.steeringBehaviors) {
            const force = this.calculateSteeringForce(agent, behavior);
            Vec3.add(totalForce, totalForce, force);
        }

        // Limit total force
        const maxForce = agent.acceleration;
        const forceMagnitude = Vec3.length(totalForce);
        if (forceMagnitude > maxForce) {
            Vec3.scale(totalForce, totalForce, maxForce / forceMagnitude);
        }

        return totalForce;
    }

    private calculateSteeringForce(agent: AIAgent, behavior: SteeringBehavior): Vec3 {
        switch (behavior.type) {
            case 'seek':
                return this.seek(agent, behavior.target!);
            case 'flee':
                return this.flee(agent, behavior.target!);
            case 'arrive':
                return this.arrive(agent, behavior.target!, behavior.deceleration || 1);
            case 'pursue':
                return this.pursue(agent, behavior.target!);
            case 'evade':
                return this.evade(agent, behavior.target!);
            case 'wander':
                return this.wander(agent, behavior.wanderData!);
            case 'obstacle_avoidance':
                return this.obstacleAvoidance(agent, behavior.obstacles || []);
            case 'separation':
                return this.separation(agent, behavior.neighbors || []);
            case 'alignment':
                return this.alignment(agent, behavior.neighbors || []);
            case 'cohesion':
                return this.cohesion(agent, behavior.neighbors || []);
            default:
                return Vec3.create();
        }
    }

    private seek(agent: AIAgent, target: Vec3): Vec3 {
        const desiredVelocity = Vec3.create();
        Vec3.subtract(desiredVelocity, target, agent.position);
        Vec3.normalize(desiredVelocity, desiredVelocity);
        Vec3.scale(desiredVelocity, desiredVelocity, agent.maxSpeed);

        const steering = Vec3.create();
        Vec3.subtract(steering, desiredVelocity, agent.velocity);

        return steering;
    }

    private flee(agent: AIAgent, target: Vec3): Vec3 {
        const steering = this.seek(agent, target);
        Vec3.negate(steering, steering);
        return steering;
    }

    private arrive(agent: AIAgent, target: Vec3, deceleration: number): Vec3 {
        const toTarget = Vec3.create();
        Vec3.subtract(toTarget, target, agent.position);
        const distance = Vec3.length(toTarget);

        if (distance > 0) {
            const speed = Math.min(distance / deceleration, agent.maxSpeed);
            Vec3.normalize(toTarget, toTarget);
            Vec3.scale(toTarget, toTarget, speed);

            const steering = Vec3.create();
            Vec3.subtract(steering, toTarget, agent.velocity);
            return steering;
        }

        return Vec3.create();
    }

    private pursue(agent: AIAgent, target: Vec3): Vec3 {
        // Predict target's future position
        const predictedTarget = Vec3.clone(target);
        // Assuming target has velocity, add it scaled by time
        // For now, just seek to current target
        return this.seek(agent, predictedTarget);
    }

    private evade(agent: AIAgent, target: Vec3): Vec3 {
        const steering = this.pursue(agent, target);
        Vec3.negate(steering, steering);
        return steering;
    }

    private wander(agent: AIAgent, wanderData: WanderData): Vec3 {
        // Update wander target
        wanderData.wanderAngle += (Math.random() - 0.5) * wanderData.angleChange;

        const circleCenter = Vec3.create();
        Vec3.copy(circleCenter, agent.velocity);
        Vec3.normalize(circleCenter, circleCenter);
        Vec3.scale(circleCenter, circleCenter, wanderData.circleDistance);

        const displacement = Vec3.fromValues(0, 0, 1);
        Vec3.rotateY(displacement, displacement, Vec3.create(), wanderData.wanderAngle);
        Vec3.scale(displacement, displacement, wanderData.circleRadius);

        const wanderTarget = Vec3.create();
        Vec3.add(wanderTarget, circleCenter, displacement);

        return this.seek(agent, wanderTarget);
    }

    private obstacleAvoidance(agent: AIAgent, obstacles: Obstacle[]): Vec3 {
        const ahead = Vec3.create();
        Vec3.copy(ahead, agent.velocity);
        Vec3.normalize(ahead, ahead);
        Vec3.scale(ahead, ahead, agent.avoidanceRadius);

        const aheadPosition = Vec3.create();
        Vec3.add(aheadPosition, agent.position, ahead);

        let mostThreatening: Obstacle | null = null;
        let minDistance = Infinity;

        for (const obstacle of obstacles) {
            const distance = Vec3.distance(aheadPosition, obstacle.position);
            if (distance < obstacle.radius + agent.radius) {
                if (distance < minDistance) {
                    minDistance = distance;
                    mostThreatening = obstacle;
                }
            }
        }

        if (mostThreatening) {
            const avoidance = Vec3.create();
            Vec3.subtract(avoidance, aheadPosition, mostThreatening.position);
            Vec3.normalize(avoidance, avoidance);
            Vec3.scale(avoidance, avoidance, agent.maxSpeed);
            Vec3.subtract(avoidance, avoidance, agent.velocity);
            return avoidance;
        }

        return Vec3.create();
    }

    private separation(agent: AIAgent, neighbors: AIAgent[]): Vec3 {
        const force = Vec3.create();

        for (const neighbor of neighbors) {
            const distance = Vec3.distance(agent.position, neighbor.position);
            if (distance > 0 && distance < agent.radius * 2) {
                const push = Vec3.create();
                Vec3.subtract(push, agent.position, neighbor.position);
                Vec3.normalize(push, push);
                Vec3.scale(push, push, 1 / distance);
                Vec3.add(force, force, push);
            }
        }

        return force;
    }

    private alignment(agent: AIAgent, neighbors: AIAgent[]): Vec3 {
        const averageVelocity = Vec3.create();
        let count = 0;

        for (const neighbor of neighbors) {
            const distance = Vec3.distance(agent.position, neighbor.position);
            if (distance > 0 && distance < 10) { // Alignment neighborhood
                Vec3.add(averageVelocity, averageVelocity, neighbor.velocity);
                count++;
            }
        }

        if (count > 0) {
            Vec3.scale(averageVelocity, averageVelocity, 1 / count);
            Vec3.subtract(averageVelocity, averageVelocity, agent.velocity);
            return averageVelocity;
        }

        return Vec3.create();
    }

    private cohesion(agent: AIAgent, neighbors: AIAgent[]): Vec3 {
        const centerOfMass = Vec3.create();
        let count = 0;

        for (const neighbor of neighbors) {
            const distance = Vec3.distance(agent.position, neighbor.position);
            if (distance > 0 && distance < 10) { // Cohesion neighborhood
                Vec3.add(centerOfMass, centerOfMass, neighbor.position);
                count++;
            }
        }

        if (count > 0) {
            Vec3.scale(centerOfMass, centerOfMass, 1 / count);
            return this.seek(agent, centerOfMass);
        }

        return Vec3.create();
    }

    // Perception system
    createPerceptionSystem(systemId: string, config: PerceptionConfig): PerceptionSystem {
        const system: PerceptionSystem = {
            id: systemId,
            sensors: config.sensors || [],
            memory: new PerceptionMemory(),
            attention: new AttentionSystem(),
            config
        };

        this.perceptionSystems.set(systemId, system);
        console.log(`[AdvancedAISystem] Created perception system: ${systemId}`);

        return system;
    }

    updatePerception(agent: AIAgent, world: World, deltaTime: number): void {
        if (!agent.perception) return;

        const startTime = performance.now();

        // Update sensors
        for (const sensor of agent.perception.sensors) {
            this.updateSensor(sensor, agent, world);
        }

        // Process attention
        agent.perception.attention.update(agent.perception.memory, deltaTime);

        // Update memory
        agent.perception.memory.update(deltaTime);

        agent.debugInfo.perceptionTime = performance.now() - startTime;
    }

    private updateSensor(sensor: Sensor, agent: AIAgent, world: World): void {
        switch (sensor.type) {
            case 'vision':
                this.updateVisionSensor(sensor as VisionSensor, agent, world);
                break;
            case 'hearing':
                this.updateHearingSensor(sensor as HearingSensor, agent, world);
                break;
            case 'touch':
                this.updateTouchSensor(sensor as TouchSensor, agent, world);
                break;
            case 'smell':
                this.updateSmellSensor(sensor as SmellSensor, agent, world);
                break;
        }
    }

    private updateVisionSensor(sensor: VisionSensor, _agent: AIAgent, _world: World): void {
        // Cast rays in vision cone
        for (let i = 0; i < sensor.rayCount; i++) {

            // Rotate by agent orientation
            // This would need proper quaternion math

            // Cast ray and check for hits
            // Add detected objects to perception memory
        }
    }

    private updateHearingSensor(_sensor: HearingSensor, _agent: AIAgent, _world: World): void {
        // Check for sound sources within range
        // Add heard sounds to perception memory
    }

    private updateTouchSensor(_sensor: TouchSensor, _agent: AIAgent, _world: World): void {
        // Check for physical contact
        // Add touch events to perception memory
    }

    private updateSmellSensor(_sensor: SmellSensor, _agent: AIAgent, _world: World): void {
        // Check for scent sources within range
        // Add smelled scents to perception memory
    }

    // Decision making
    createDecisionMaker(makerId: string, type: DecisionMakerType, config: any): DecisionMaker {
        const maker: DecisionMaker = {
            id: makerId,
            type,
            config,
            evaluate: this.getDecisionFunction(type)
        };

        this.decisionMakers.set(makerId, maker);
        console.log(`[AdvancedAISystem] Created decision maker: ${makerId} (${type})`);

        return maker;
    }

    private getDecisionFunction(type: DecisionMakerType): (agent: AIAgent, goals: AIGoal[]) => AIGoal | null {
        switch (type) {
            case 'utility':
                return (agent, goals) => {
                    let bestGoal: AIGoal | null = null;
                    let bestUtility = -Infinity;

                    for (const goal of goals) {
                        const utility = this.calculateUtility(agent, goal);
                        if (utility > bestUtility) {
                            bestUtility = utility;
                            bestGoal = goal;
                        }
                    }

                    return bestGoal;
                };

            case 'goal_sa':
                return (_agent, goals) => {
                    // Simple goal selection based on priority
                    return goals.sort((a, b) => b.priority - a.priority)[0] || null;
                };

            case 'behavioral':
                return (_agent, goals) => {
                    // Behavioral decision making
                    return goals[0] || null;
                };

            default:
                return () => null;
        }
    }

    private calculateUtility(agent: AIAgent, goal: AIGoal): number {
        let utility = goal.baseUtility;

        // Add consideration utilities
        for (const consideration of goal.considerations) {
            utility *= this.evaluateConsideration(agent, consideration);
        }

        return utility;
    }

    private evaluateConsideration(agent: AIAgent, consideration: Consideration): number {
        const value = consideration.input(agent);
        return consideration.curve.evaluate(value);
    }

    // Formation system
    createFormation(formationId: string, type: FormationType, config: FormationConfig): Formation {
        const formation: Formation = {
            id: formationId,
            type,
            positions: [],
            config
        };

        // Generate formation positions
        this.generateFormationPositions(formation);

        this.formations.set(formationId, formation);
        console.log(`[AdvancedAISystem] Created formation: ${formationId} (${formation.positions.length} positions)`);

        return formation;
    }

    private generateFormationPositions(formation: Formation): void {
        formation.positions = [];

        switch (formation.type) {
            case 'line':
                for (let i = 0; i < formation.config.count; i++) {
                    const offset = i - (formation.config.count - 1) / 2;
                    formation.positions.push(Vec3.fromValues(
                        offset * formation.config.spacing,
                        0,
                        0
                    ));
                }
                break;

            case 'circle':
                for (let i = 0; i < formation.config.count; i++) {
                    const angle = (i / formation.config.count) * Math.PI * 2;
                    formation.positions.push(Vec3.fromValues(
                        Math.cos(angle) * (formation.config.radius || 1),
                        0,
                        Math.sin(angle) * (formation.config.radius || 1)
                    ));
                }
                break;

            case 'wedge':
                for (let i = 0; i < formation.config.count; i++) {
                    const width = formation.config.width || 1;
                    const row = Math.floor(i / width);
                    const col = i % width;
                    formation.positions.push(Vec3.fromValues(
                        col * formation.config.spacing - (width - 1) * formation.config.spacing / 2,
                        0,
                        row * formation.config.spacing
                    ));
                }
                break;

            case 'column':
                for (let i = 0; i < formation.config.count; i++) {
                    formation.positions.push(Vec3.fromValues(
                        0,
                        0,
                        i * formation.config.spacing
                    ));
                }
                break;
        }
    }

    assignAgentToFormation(agentId: string, formationId: string, positionIndex: number): void {
        const agent = this.agents.get(agentId);
        const formation = this.formations.get(formationId);

        if (!agent || !formation || positionIndex >= formation.positions.length) return;

        agent.formation = formation;
        agent.formationPosition = formation.positions[positionIndex];
    }

    // Flocking system
    createFlockingSystem(systemId: string, agents: string[], config: FlockingConfig): FlockingSystem {
        const system: FlockingSystem = {
            id: systemId,
            agents: new Set(agents),
            config,
            centerOfMass: Vec3.create(),
            averageVelocity: Vec3.create()
        };

        this.flockingSystems.set(systemId, system);
        console.log(`[AdvancedAISystem] Created flocking system: ${systemId} (${agents.length} agents)`);

        return system;
    }

    updateFlocking(systemId: string, deltaTime: number): void {
        const system = this.flockingSystems.get(systemId);
        if (!system) return;

        // Calculate flock properties
        this.calculateFlockProperties(system);

        // Apply flocking forces to each agent
        for (const agentId of system.agents) {
            const agent = this.agents.get(agentId);
            if (!agent) continue;

            const force = this.calculateFlockingForce(agent, system);
            this.applyForceToAgent(agent, force, deltaTime);
        }
    }

    private calculateFlockProperties(system: FlockingSystem): void {
        Vec3.set(system.centerOfMass, 0, 0, 0);
        Vec3.set(system.averageVelocity, 0, 0, 0);

        let count = 0;

        for (const agentId of system.agents) {
            const agent = this.agents.get(agentId);
            if (!agent) continue;

            Vec3.add(system.centerOfMass, system.centerOfMass, agent.position);
            Vec3.add(system.averageVelocity, system.averageVelocity, agent.velocity);
            count++;
        }

        if (count > 0) {
            Vec3.scale(system.centerOfMass, system.centerOfMass, 1 / count);
            Vec3.scale(system.averageVelocity, system.averageVelocity, 1 / count);
        }
    }

    private calculateFlockingForce(agent: AIAgent, system: FlockingSystem): Vec3 {
        const separation = this.calculateSeparationForce(agent, system);
        const alignment = this.calculateAlignmentForce(agent, system);
        const cohesion = this.calculateCohesionForce(agent, system);

        Vec3.scale(separation, separation, system.config.separationWeight);
        Vec3.scale(alignment, alignment, system.config.alignmentWeight);
        Vec3.scale(cohesion, cohesion, system.config.cohesionWeight);

        const totalForce = Vec3.create();
        Vec3.add(totalForce, totalForce, separation);
        Vec3.add(totalForce, totalForce, alignment);
        Vec3.add(totalForce, totalForce, cohesion);

        return totalForce;
    }

    private calculateSeparationForce(agent: AIAgent, system: FlockingSystem): Vec3 {
        const force = Vec3.create();
        let neighborCount = 0;

        for (const agentId of system.agents) {
            const other = this.agents.get(agentId);
            if (!other || other.id === agent.id) continue;

            const distance = Vec3.distance(agent.position, other.position);
            if (distance < system.config.separationRadius && distance > 0) {
                const push = Vec3.create();
                Vec3.subtract(push, agent.position, other.position);
                Vec3.normalize(push, push);
                Vec3.scale(push, push, 1 / distance);
                Vec3.add(force, force, push);
                neighborCount++;
            }
        }

        if (neighborCount > 0) {
            Vec3.scale(force, force, 1 / neighborCount);
        }

        return force;
    }

    private calculateAlignmentForce(agent: AIAgent, system: FlockingSystem): Vec3 {
        const force = Vec3.create();
        let neighborCount = 0;

        for (const agentId of system.agents) {
            const other = this.agents.get(agentId);
            if (!other || other.id === agent.id) continue;

            const distance = Vec3.distance(agent.position, other.position);
            if (distance < system.config.alignmentRadius) {
                Vec3.add(force, force, other.velocity);
                neighborCount++;
            }
        }

        if (neighborCount > 0) {
            Vec3.scale(force, force, 1 / neighborCount);
            Vec3.subtract(force, force, agent.velocity);
        }

        return force;
    }

    private calculateCohesionForce(agent: AIAgent, system: FlockingSystem): Vec3 {
        const force = Vec3.create();
        let neighborCount = 0;

        for (const agentId of system.agents) {
            const other = this.agents.get(agentId);
            if (!other || other.id === agent.id) continue;

            const distance = Vec3.distance(agent.position, other.position);
            if (distance < system.config.cohesionRadius) {
                Vec3.add(force, force, other.position);
                neighborCount++;
            }
        }

        if (neighborCount > 0) {
            Vec3.scale(force, force, 1 / neighborCount);
            Vec3.subtract(force, force, agent.position);
        }

        return force;
    }

    private applyForceToAgent(agent: AIAgent, force: Vec3, deltaTime: number): void {
        Vec3.scaleAndAdd(agent.velocity, agent.velocity, force, deltaTime);

        // Limit speed
        const speed = Vec3.length(agent.velocity);
        if (speed > agent.maxSpeed) {
            Vec3.scale(agent.velocity, agent.velocity, agent.maxSpeed / speed);
        }

        // Update position
        const deltaPos = Vec3.create();
        Vec3.scale(deltaPos, agent.velocity, deltaTime);
        Vec3.add(agent.position, agent.position, deltaPos);
    }

    // Learning and adaptation
    createReinforcementLearner(learnerId: string, config: ReinforcementConfig): ReinforcementLearner {
        const learner: ReinforcementLearner = {
            id: learnerId,
            config,
            qTable: new Map(),
            currentState: null,
            lastAction: null,
            lastReward: 0,
            epsilon: config.epsilon || 0.1,
            alpha: config.alpha || 0.1,
            gamma: config.gamma || 0.9
        };

        this.reinforcementLearners.set(learnerId, learner);
        console.log(`[AdvancedAISystem] Created reinforcement learner: ${learnerId}`);

        return learner;
    }

    updateReinforcementLearning(agentId: string, learnerId: string, reward: number, nextState: string): void {
        const agent = this.agents.get(agentId);
        const learner = this.reinforcementLearners.get(learnerId);

        if (!agent || !learner) return;

        // Q-learning update
        if (learner.currentState && learner.lastAction !== null) {
            const stateActionKey = `${learner.currentState}_${learner.lastAction}`;
            const nextMaxQ = this.getMaxQForState(learner, nextState);

            const currentQ = learner.qTable.get(stateActionKey) || 0;
            const newQ = currentQ + learner.alpha * (reward + learner.gamma * nextMaxQ - currentQ);

            learner.qTable.set(stateActionKey, newQ);
        }

        learner.lastReward = reward;
        learner.currentState = nextState;
    }

    private getMaxQForState(learner: ReinforcementLearner, state: string): number {
        let maxQ = 0;

        for (let action = 0; action < learner.config.actionCount; action++) {
            const qValue = learner.qTable.get(`${state}_${action}`) || 0;
            maxQ = Math.max(maxQ, qValue);
        }

        return maxQ;
    }

    // Main update loop
    update(world: World, deltaTime: number): void {
        const currentTime = performance.now();

        // Throttle updates based on frequency
        if (currentTime - this.lastUpdateTime < 1000 / this.updateFrequency) {
            return;
        }

        this.lastUpdateTime = currentTime;

        // Update active agents
        for (const agent of this.agents.values()) {
            if (!agent.isActive || agent.isPaused) continue;

            const startTime = performance.now();

            // Update perception
            this.updatePerception(agent, world, deltaTime);

            // Update decision making
            if (agent.decisionMaker) {
                const goals = this.getRelevantGoals(agent);
                const chosenGoal = agent.decisionMaker.evaluate(agent, goals);
                if (chosenGoal) {
                    agent.currentGoal = chosenGoal;
                    this.executeGoal(agent, chosenGoal);
                }
            }

            // Update behavior tree
            if (agent.behaviorTree) {
                this.executeBehaviorTree(agent.behaviorTree, agent.id, deltaTime);
            }

            // Update state machine
            if (agent.stateMachine) {
                this.updateStateMachine(agent.stateMachine, agent.id, deltaTime);
            }

            // Apply steering behaviors
            const steeringForce = this.calculateSteering(agent, deltaTime);
            this.applyForceToAgent(agent, steeringForce, deltaTime);

            // Update pathfinding
            this.updateAgentPathfinding(agent, deltaTime);

            // Update formation
            if (agent.formation) {
                this.updateAgentFormation(agent, deltaTime);
            }

            agent.debugInfo.lastUpdateTime = performance.now() - startTime;
        }

        // Update flocking systems
        for (const systemId of this.flockingSystems.keys()) {
            this.updateFlocking(systemId, deltaTime);
        }

        // Update reinforcement learners
        for (const [_learnerId, _learner] of this.reinforcementLearners) {
            // Periodic learning updates would go here
        }

        // Update spatial grid
        this.spatialGrid.update();

        // Clear debug data if not in debug mode
        if (!this.debugMode) {
            this.debugPaths.length = 0;
            this.debugGoals.length = 0;
            this.debugPerception.length = 0;
        }
    }

    private getRelevantGoals(agent: AIAgent): AIGoal[] {
        // Return goals relevant to current situation
        return Array.from(this.goals.values()).filter(goal =>
            this.evaluateGoalRelevance(agent, goal)
        );
    }

    private evaluateGoalRelevance(agent: AIAgent, goal: AIGoal): boolean {
        // Check goal preconditions
        for (const precondition of goal.preconditions) {
            if (!precondition.evaluate(agent)) {
                return false;
            }
        }

        return true;
    }

    private executeGoal(agent: AIAgent, goal: AIGoal): void {
        // Set up goal execution
        if (goal.targetPosition) {
            const path = this.findPath(agent.position, goal.targetPosition, agent.navigationMesh);
            if (path) {
                this.setAgentPath(agent.id, path);
            }
        }

        // Execute goal actions
        for (const action of goal.actions) {
            action.execute(agent);
        }
    }

    private updateAgentFormation(agent: AIAgent, deltaTime: number): void {
        if (!agent.formation) return;

        // Calculate target position based on formation and leader
        const targetPosition = Vec3.create();
        // This would calculate position relative to formation leader

        // Move towards formation position
        const distance = Vec3.distance(agent.position, targetPosition);
        if (distance > 0.1) {
            const direction = Vec3.create();
            Vec3.subtract(direction, targetPosition, agent.position);
            Vec3.normalize(direction, direction);
            Vec3.scale(direction, direction, agent.speed * deltaTime);
            Vec3.add(agent.position, agent.position, direction);
        }
    }

    // Utility methods
    private createDefaultPerception(): PerceptionSystem {
        return {
            id: 'default',
            sensors: [
                {
                    type: 'vision',
                    range: 20,
                    fieldOfView: Math.PI / 2,
                    rayCount: 16
                } as VisionSensor
            ],
            memory: new PerceptionMemory(),
            attention: new AttentionSystem(),
            config: {}
        };
    }

    raycast(_origin: Vec3, _direction: Vec3, _maxDistance: number): RaycastHit | null {
        // Perform raycast against navigation meshes and obstacles
        // This is a simplified implementation

        let closestHit: RaycastHit | null = null;

        // Check against navigation meshes
        // for (const navMesh of this.navigationMeshes.values()) {
        //     // Ray-triangle intersection tests would go here
        // }

        return closestHit;
    }

    queryAgentsInRadius(center: Vec3, radius: number): AIAgent[] {
        return this.spatialGrid.queryRadius(center, radius);
    }

    // Debug and visualization
    getDebugInfo(): any {
        return {
            activeAgents: this.activeAgents,
            maxAgents: this.maxAgents,
            totalAgents: this.agents.size,
            behaviorTrees: this.behaviorTrees.size,
            stateMachines: this.stateMachines.size,
            navigationMeshes: this.navigationMeshes.size,
            formations: this.formations.size,
            flockingSystems: this.flockingSystems.size,
            debugPaths: this.debugPaths.length,
            debugGoals: this.debugGoals.length,
            debugPerception: this.debugPerception.length,
            updateFrequency: this.updateFrequency
        };
    }

    setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    getDebugPaths(): Path[] {
        return [...this.debugPaths];
    }

    getDebugGoals(): Vec3[] {
        return [...this.debugGoals];
    }

    getDebugPerception(): PerceptionDebug[] {
        return [...this.debugPerception];
    }

    // Cleanup
    dispose(): void {
        this.agents.clear();
        this.behaviorTrees.clear();
        this.stateMachines.clear();
        this.steeringBehaviors.clear();
        this.navigationMeshes.clear();
        this.perceptionSystems.clear();
        this.decisionMakers.clear();
        this.goals.clear();
        this.formations.clear();
        this.flockingSystems.clear();
        this.reinforcementLearners.clear();
        this.behaviorAdaptors.clear();

        this.pathCache.clear();
        this.debugPaths.length = 0;
        this.debugGoals.length = 0;
        this.debugPerception.length = 0;

        console.log('[AdvancedAISystem] Disposed');
    }
}

// Type definitions and supporting classes
enum BehaviorStatus {
    Success = 'success',
    Failure = 'failure',
    Running = 'running'
}

interface BehaviorNode {
    id: string;
    type: 'composite' | 'decorator' | 'action' | 'condition';
}

interface CompositeNode extends BehaviorNode {
    type: 'composite';
    compositeType: 'sequence' | 'selector' | 'parallel';
    children: BehaviorNode[];
}

interface DecoratorNode extends BehaviorNode {
    type: 'decorator';
    decoratorType: 'inverter' | 'succeeder' | 'failer' | 'repeater' | 'repeat_until_fail' | 'timer';
    child: BehaviorNode;
    timerDuration?: number;
}

interface ActionNode extends BehaviorNode {
    type: 'action';
    actionType: 'move_to' | 'wait' | 'attack' | 'flee' | 'patrol' | 'follow' | 'wander' | 'look_at' | 'play_animation' | 'custom';
    target?: Vec3;
    duration?: number;
    waypoints?: Vec3[];
    distance?: number;
    animation?: string;
    customFunction?: (agent: AIAgent, blackboard: Map<string, any>, deltaTime: number) => BehaviorStatus;
}

interface ConditionNode extends BehaviorNode {
    type: 'condition';
    conditionType: 'has_target' | 'in_range' | 'can_see' | 'health_above' | 'time_elapsed' | 'custom';
    target?: Vec3;
    range?: number;
    threshold?: number;
    duration?: number;
    customFunction?: (agent: AIAgent, blackboard: Map<string, any>) => boolean;
}

interface BehaviorTree {
    id: string;
    rootNode: BehaviorNode;
    blackboard: Map<string, any>;
    runningNodes: Set<string>;
    lastExecutionTime: number;
}

interface AIAgent {
    id: string;
    entityId: Entity;
    position: Vec3;
    velocity: Vec3;
    orientation: Vec3;
    speed: number;
    maxSpeed: number;
    acceleration: number;
    angularSpeed: number;
    radius: number;

    // AI components
    behaviorTree?: string;
    stateMachine?: string;
    steeringBehaviors: SteeringBehavior[];
    perception?: PerceptionSystem;
    decisionMaker?: DecisionMaker;

    // State
    currentGoal?: AIGoal;
    currentPath?: Path;
    currentTarget?: Vec3;
    isActive: boolean;
    isPaused: boolean;

    // Navigation
    navigationMesh?: string;
    avoidanceRadius: number;

    // Group behavior
    groupId?: string;
    formation?: Formation;
    formationPosition: Vec3;

    // Memory and learning
    memory: AIMemory;
    learning?: LearningConfig;

    // Debug
    debugInfo: AgentDebugInfo;
}

interface AIAgentConfig {
    entityId: Entity;
    position: [number, number, number];
    speed?: number;
    maxSpeed?: number;
    acceleration?: number;
    angularSpeed?: number;
    radius?: number;
    behaviorTree?: string;
    stateMachine?: string;
    steeringBehaviors?: SteeringBehavior[];
    perception?: PerceptionSystem;
    decisionMaker?: string;
    navigationMesh?: string;
    avoidanceRadius?: number;
    groupId?: string;
    formation?: string;
    formationPosition?: [number, number, number];
    learning?: LearningConfig;
}

interface SteeringBehavior {
    type: 'seek' | 'flee' | 'arrive' | 'pursue' | 'evade' | 'wander' | 'obstacle_avoidance' | 'separation' | 'alignment' | 'cohesion';
    weight?: number;
    target?: Vec3;
    deceleration?: number;
    wanderData?: WanderData;
    obstacles?: Obstacle[];
    neighbors?: AIAgent[];
}

interface WanderData {
    circleDistance: number;
    circleRadius: number;
    angleChange: number;
    wanderAngle: number;
}

interface Obstacle {
    position: Vec3;
    radius: number;
}

interface Path {
    id: string;
    points: Vec3[];
    cost: number;
    isValid: boolean;
}

interface NavigationMesh {
    id: string;
    triangles: Triangle[];
    bounds: AABB;
    nodes: NavNode[];
    edges: NavEdge[];
}

interface Triangle {
    v1: Vec3;
    v2: Vec3;
    v3: Vec3;
}

interface AABB {
    min: Vec3;
    max: Vec3;
}

interface NavNode {
    position: Vec3;
    connections: number[];
    cost: number;
}

interface NavEdge {
    from: number;
    to: number;
    cost: number;
}



interface AIState {
    name: string;
    enter?: (agent: AIAgent) => void;
    update?: (agent: AIAgent, deltaTime: number) => void;
    exit?: (agent: AIAgent) => void;
    transitions: StateTransition[];
}

interface StateTransition {
    fromState: string;
    toState: string;
    condition: TransitionCondition;
}

interface TransitionCondition {
    parameter: string;
    type: 'bool' | 'int' | 'float' | 'trigger';
    comparison?: 'equals' | 'greater' | 'less';
    value: any;
    threshold?: number;
    triggered?: boolean;
}

interface AIStateMachine {
    id: string;
    name: string;
    states: Map<string, AIState>;
    transitions: StateTransition[];
    currentState: string;
    globalTransitions: StateTransition[];
    parameters: Map<string, any>;
    lastTransitionTime: number;
}

interface PerceptionSystem {
    id: string;
    sensors: Sensor[];
    memory: PerceptionMemory;
    attention: AttentionSystem;
    config: PerceptionConfig;
}

interface Sensor {
    type: 'vision' | 'hearing' | 'touch' | 'smell';
}

interface VisionSensor extends Sensor {
    type: 'vision';
    range: number;
    fieldOfView: number;
    rayCount: number;
}

interface HearingSensor extends Sensor {
    type: 'hearing';
    range: number;
    sensitivity: number;
}

interface TouchSensor extends Sensor {
    type: 'touch';
    range: number;
}

interface SmellSensor extends Sensor {
    type: 'smell';
    range: number;
    sensitivity: number;
}

interface PerceptionMemory {
    entities: Map<Entity, PerceivedEntity>;
    events: PerceptionEvent[];
    update(deltaTime: number): void;
}

interface PerceivedEntity {
    entityId: Entity;
    position: Vec3;
    velocity: Vec3;
    type: string;
    lastSeen: number;
    confidence: number;
}

interface PerceptionEvent {
    type: string;
    position: Vec3;
    intensity: number;
    timestamp: number;
}

interface AttentionSystem {
    focus: any;
    update(memory: PerceptionMemory, deltaTime: number): void;
}

interface PerceptionConfig {
    sensors?: Sensor[];
    memoryDuration?: number;
    attentionSpan?: number;
}

interface DecisionMaker {
    id: string;
    type: DecisionMakerType;
    config: any;
    evaluate: (agent: AIAgent, goals: AIGoal[]) => AIGoal | null;
}

type DecisionMakerType = 'utility' | 'goal_sa' | 'behavioral';

interface AIGoal {
    id: string;
    name: string;
    priority: number;
    baseUtility: number;
    preconditions: GoalPrecondition[];
    targetPosition?: Vec3;
    targetEntity?: Entity;
    actions: GoalAction[];
    considerations: Consideration[];
}

interface GoalPrecondition {
    evaluate: (agent: AIAgent) => boolean;
}

interface GoalAction {
    execute: (agent: AIAgent) => void;
}

interface Consideration {
    name: string;
    input: (agent: AIAgent) => number;
    curve: ResponseCurve;
}

interface ResponseCurve {
    evaluate: (input: number) => number;
}

interface Formation {
    id: string;
    type: FormationType;
    positions: Vec3[];
    config: FormationConfig;
}

type FormationType = 'line' | 'circle' | 'wedge' | 'column';

interface FormationConfig {
    count: number;
    spacing: number;
    radius?: number;
    width?: number;
}

interface FlockingSystem {
    id: string;
    agents: Set<string>;
    config: FlockingConfig;
    centerOfMass: Vec3;
    averageVelocity: Vec3;
}

interface FlockingConfig {
    separationRadius: number;
    separationWeight: number;
    alignmentRadius: number;
    alignmentWeight: number;
    cohesionRadius: number;
    cohesionWeight: number;
}

interface ReinforcementLearner {
    id: string;
    config: ReinforcementConfig;
    qTable: Map<string, number>;
    currentState: string | null;
    lastAction: number | null;
    lastReward: number;
    epsilon: number;
    alpha: number;
    gamma: number;
}

interface ReinforcementConfig {
    actionCount: number;
    epsilon: number;
    alpha: number;
    gamma: number;
}

interface BehaviorAdaptor {
    id: string;
    agentId: string;
    adaptationRules: AdaptationRule[];
    performanceMetrics: Map<string, number>;
}

interface AdaptationRule {
    condition: (metrics: Map<string, number>) => boolean;
    action: (agent: AIAgent) => void;
}

interface AIMemory {
    facts: Map<string, any>;
    events: MemoryEvent[];
    addFact(key: string, value: any): void;
    getFact(key: string): any;
    addEvent(event: MemoryEvent): void;
    recallEvents(type: string, since: number): MemoryEvent[];
}

interface MemoryEvent {
    type: string;
    data: any;
    timestamp: number;
    importance: number;
}

interface LearningConfig {
    type: 'reinforcement' | 'supervised' | 'unsupervised';
    learnerId?: string;
    enabled: boolean;
}

interface AgentDebugInfo {
    pathfindingTime: number;
    decisionTime: number;
    perceptionTime: number;
    lastUpdateTime: number;
}

interface RaycastHit {
    point: Vec3;
    normal: Vec3;
    distance: number;
    entity?: Entity;
}

interface SpatialGrid {
    addAgent(agent: AIAgent): void;
    removeAgent(agent: AIAgent): void;
    queryRadius(center: Vec3, radius: number): AIAgent[];
    update(): void;
}

interface PerceptionDebug {
    agentId: string;
    sensorData: any[];
    memorySize: number;
}

interface Pathfinder {
    findPath(start: Vec3, end: Vec3, _navMesh?: NavigationMesh): Path | null;
}

class AStarPathfinder implements Pathfinder {
    findPath(start: Vec3, end: Vec3, _navMesh?: NavigationMesh): Path | null {
        // A* pathfinding implementation
        // This would include proper graph search with heuristics
        // Simplified for demonstration

        const path: Path = {
            id: `path_${Date.now()}`,
            points: [Vec3.clone(start), Vec3.clone(end)],
            cost: Vec3.distance(start, end),
            isValid: true
        };

        return path;
    }
}

class SpatialGrid implements SpatialGrid {
    private cells: Map<string, AIAgent[]> = new Map();
    private cellSize: number;

    constructor(cellSize: number) {
        this.cellSize = cellSize;
    }

    addAgent(agent: AIAgent): void {
        const cellKey = this.getCellKey(agent.position);
        if (!this.cells.has(cellKey)) {
            this.cells.set(cellKey, []);
        }
        this.cells.get(cellKey)!.push(agent);
    }

    removeAgent(agent: AIAgent): void {
        const cellKey = this.getCellKey(agent.position);
        const cell = this.cells.get(cellKey);
        if (cell) {
            const index = cell.indexOf(agent);
            if (index > -1) {
                cell.splice(index, 1);
            }
        }
    }

    queryRadius(center: Vec3, radius: number): AIAgent[] {
        const agents: AIAgent[] = [];
        const minCellX = Math.floor((center[0] - radius) / this.cellSize);
        const maxCellX = Math.floor((center[0] + radius) / this.cellSize);
        const minCellZ = Math.floor((center[2] - radius) / this.cellSize);
        const maxCellZ = Math.floor((center[2] + radius) / this.cellSize);

        for (let x = minCellX; x <= maxCellX; x++) {
            for (let z = minCellZ; z <= maxCellZ; z++) {
                const cellKey = `${x},${z}`;
                const cell = this.cells.get(cellKey);
                if (cell) {
                    for (const agent of cell) {
                        if (Vec3.distance(center, agent.position) <= radius) {
                            agents.push(agent);
                        }
                    }
                }
            }
        }

        return agents;
    }

    update(): void {
        // Rebuild grid when agents move
        const allAgents = Array.from(this.cells.values()).flat();
        this.cells.clear();

        for (const agent of allAgents) {
            this.addAgent(agent);
        }
    }

    private getCellKey(position: Vec3): string {
        const x = Math.floor(position[0] / this.cellSize);
        const z = Math.floor(position[2] / this.cellSize);
        return `${x},${z}`;
    }
}

// Stub implementations for missing classes
class AIMemory implements AIMemory {
    facts: Map<string, any> = new Map();
    events: MemoryEvent[] = [];

    addFact(key: string, value: any): void {
        this.facts.set(key, value);
    }

    getFact(key: string): any {
        return this.facts.get(key);
    }

    addEvent(event: MemoryEvent): void {
        this.events.push(event);
    }

    recallEvents(type: string, since: number): MemoryEvent[] {
        return this.events.filter(e => e.type === type && e.timestamp >= since);
    }
}

class PerceptionMemory implements PerceptionMemory {
    entities: Map<Entity, PerceivedEntity> = new Map();
    events: PerceptionEvent[] = [];

    update(_deltaTime: number): void {
        // Decay confidence over time
        for (const [entityId, entity] of this.entities) {
            entity.confidence *= 0.99; // Decay factor

            if (entity.confidence < 0.1) {
                this.entities.delete(entityId);
            }
        }

        // Remove old events
        const currentTime = performance.now();
        this.events = this.events.filter(e => currentTime - e.timestamp < 10000); // Keep 10 seconds
    }
}

class AttentionSystem implements AttentionSystem {
    focus: any = null;

    update(memory: PerceptionMemory, _deltaTime: number): void {
        // Simple attention system - focus on highest confidence entity
        let highestConfidence = 0;
        let targetEntity: Entity | null = null;

        for (const [entityId, entity] of memory.entities) {
            if (entity.confidence > highestConfidence) {
                highestConfidence = entity.confidence;
                targetEntity = entityId;
            }
        }

        this.focus = targetEntity;
    }
}
