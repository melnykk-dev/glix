import { Vec2, Vec3, Mat4 } from '../math';
import { World } from '../core/World';
import { Entity } from '@glix/shared';

/**
 * Advanced Animation System with keyframe animation, skeletal animation, blend trees,
 * inverse kinematics, procedural animation, and state machines.
 */
export class AdvancedAnimationSystem {
    private gl: WebGL2RenderingContext;
    private animations: Map<string, AnimationClip> = new Map();
    private skeletons: Map<string, Skeleton> = new Map();
    private blendTrees: Map<string, BlendTree> = new Map();
    private stateMachines: Map<string, AnimationStateMachine> = new Map();
    private ikSolvers: Map<string, IKSolver> = new Map();
    private proceduralAnimators: Map<string, ProceduralAnimator> = new Map();

    // Runtime state
    private activeAnimations: Map<Entity, ActiveAnimation[]> = new Map();
    private boneTransforms: Map<Entity, Mat4[]> = new Map();
    private blendStates: Map<Entity, BlendState> = new Map();

    // GPU acceleration
    private animationShader: WebGLProgram | null = null;
    private boneTexture: WebGLTexture | null = null;
    private boneBuffer: WebGLBuffer | null = null;

    // Performance
    private maxBones: number = 64;
    private animationPool: ActiveAnimation[] = [];
    private transformPool: Mat4[] = [];

    // Advanced features
    private motionCapture: boolean = false;
    private facialAnimation: boolean = false;
    private clothAnimation: boolean = false;
    private particleAnimation: boolean = false;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.initializeShaders();
        this.initializeBuffers();
        console.log('[AdvancedAnimationSystem] Advanced animation system initialized');
    }

    private initializeShaders(): void {
        const gl = this.gl;

        // Skinning shader for skeletal animation
        const vertexShader = `#version 300 es
            layout(location = 0) in vec3 a_position;
            layout(location = 1) in vec3 a_normal;
            layout(location = 2) in vec2 a_texCoord;
            layout(location = 3) in vec4 a_boneIndices;
            layout(location = 4) in vec4 a_boneWeights;

            uniform mat4 u_modelViewProjection;
            uniform mat4 u_boneMatrices[${this.maxBones}];
            uniform bool u_useSkinning;

            out vec2 v_texCoord;
            out vec3 v_normal;
            out vec3 v_worldPos;

            void main() {
                vec4 position = vec4(a_position, 1.0);
                vec3 normal = a_normal;

                if (u_useSkinning) {
                    mat4 boneTransform = mat4(0.0);

                    // Blend bone transforms based on weights
                    for (int i = 0; i < 4; i++) {
                        int boneIndex = int(a_boneIndices[i]);
                        if (boneIndex >= 0 && boneIndex < ${this.maxBones}) {
                            boneTransform += u_boneMatrices[boneIndex] * a_boneWeights[i];
                        }
                    }

                    position = boneTransform * position;
                    normal = mat3(boneTransform) * normal;
                }

                gl_Position = u_modelViewProjection * position;
                v_texCoord = a_texCoord;
                v_normal = normal;
                v_worldPos = position.xyz;
            }
        `;

        const fragmentShader = `#version 300 es
            precision mediump float;

            in vec2 v_texCoord;
            in vec3 v_normal;
            in vec3 v_worldPos;

            uniform sampler2D u_diffuseTexture;
            uniform vec3 u_lightDirection;
            uniform vec4 u_diffuseColor;
            uniform bool u_useLighting;

            out vec4 outColor;

            void main() {
                vec4 texColor = texture(u_diffuseTexture, v_texCoord);
                vec4 finalColor = texColor * u_diffuseColor;

                if (u_useLighting) {
                    float diffuse = max(dot(normalize(v_normal), -u_lightDirection), 0.0);
                    finalColor.rgb *= diffuse * 0.8 + 0.2; // Ambient + diffuse
                }

                outColor = finalColor;
            }
        `;

        this.animationShader = this.createShaderProgram(vertexShader, fragmentShader);
    }

    private createShaderProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
        const gl = this.gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader!, vertexSource);
        gl.compileShader(vertexShader!);

        if (!gl.getShaderParameter(vertexShader!, gl.COMPILE_STATUS)) {
            console.error('Animation vertex shader compilation error:', gl.getShaderInfoLog(vertexShader!));
            return null;
        }

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader!, fragmentSource);
        gl.compileShader(fragmentShader!);

        if (!gl.getShaderParameter(fragmentShader!, gl.COMPILE_STATUS)) {
            console.error('Animation fragment shader compilation error:', gl.getShaderInfoLog(fragmentShader!));
            return null;
        }

        const program = gl.createProgram();
        gl.attachShader(program!, vertexShader!);
        gl.attachShader(program!, fragmentShader!);
        gl.linkProgram(program!);

        if (!gl.getProgramParameter(program!, gl.LINK_STATUS)) {
            console.error('Animation shader program linking error:', gl.getProgramInfoLog(program!));
            return null;
        }

        return program!;
    }

    private initializeBuffers(): void {
        const gl = this.gl;

        // Create bone matrix texture buffer for GPU skinning
        this.boneBuffer = gl.createBuffer();
        gl.bindBuffer(gl.TEXTURE_BUFFER, this.boneBuffer);

        // Allocate space for bone matrices (16 floats per matrix * max bones)
        gl.bufferData(gl.TEXTURE_BUFFER, this.maxBones * 16 * 4, gl.DYNAMIC_DRAW);

        // Create bone texture
        this.boneTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_BUFFER, this.boneTexture);
        gl.texBuffer(gl.TEXTURE_BUFFER, gl.RGBA32F, this.boneBuffer);
    }

    // Animation clip management
    createAnimationClip(name: string, duration: number, keyframes: Keyframe[]): string {
        const clipId = `anim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const clip: AnimationClip = {
            id: clipId,
            name,
            duration,
            keyframes,
            loop: false,
            speed: 1.0,
            blendMode: 'override',
            events: []
        };

        this.animations.set(clipId, clip);
        console.log(`[AdvancedAnimationSystem] Created animation clip: ${name} (${clipId})`);

        return clipId;
    }

    // Skeletal animation
    createSkeleton(name: string, bones: Bone[]): string {
        const skeletonId = `skel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const skeleton: Skeleton = {
            id: skeletonId,
            name,
            bones,
            boneMap: new Map(bones.map(bone => [bone.name, bone])),
            rootBone: bones.find(bone => !bone.parent) || bones[0],
            bindPose: bones.map(bone => Mat4.clone(bone.bindPose)),
            inverseBindPose: bones.map(bone => Mat4.invert(Mat4.create(), bone.bindPose))
        };

        this.skeletons.set(skeletonId, skeleton);
        console.log(`[AdvancedAnimationSystem] Created skeleton: ${name} (${bones.length} bones)`);

        return skeletonId;
    }

    // Blend tree system
    createBlendTree(name: string, blendType: BlendTreeType, parameters: BlendParameter[]): string {
        const treeId = `blend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const blendTree: BlendTree = {
            id: treeId,
            name,
            type: blendType,
            parameters,
            nodes: [],
            rootNode: null,
            transitions: []
        };

        this.blendTrees.set(treeId, blendTree);
        console.log(`[AdvancedAnimationSystem] Created blend tree: ${name}`);

        return treeId;
    }

    addBlendNode(treeId: string, node: BlendNode): string {
        const tree = this.blendTrees.get(treeId);
        if (!tree) return '';

        const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        node.id = nodeId;
        tree.nodes.push(node);

        if (!tree.rootNode) {
            tree.rootNode = node;
        }

        return nodeId;
    }

    // Animation state machine
    createStateMachine(name: string, states: AnimationState[], transitions: StateTransition[]): string {
        const smId = `sm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const stateMachine: AnimationStateMachine = {
            id: smId,
            name,
            states,
            transitions,
            currentState: states[0]?.name || '',
            parameters: new Map(),
            anyStateTransitions: []
        };

        this.stateMachines.set(smId, stateMachine);
        console.log(`[AdvancedAnimationSystem] Created state machine: ${name} (${states.length} states)`);

        return smId;
    }

    // Inverse kinematics
    createIKSolver(type: 'ccd' | 'fabrik' | 'two_bone', bones: string[], target: Vec3, constraints?: IKConstraint[]): string {
        const solverId = `ik_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const solver: IKSolver = {
            id: solverId,
            type,
            bones,
            target: Vec3.clone(target),
            constraints: constraints || [],
            maxIterations: 10,
            tolerance: 0.01,
            enabled: true
        };

        this.ikSolvers.set(solverId, solver);
        console.log(`[AdvancedAnimationSystem] Created IK solver: ${type} (${bones.length} bones)`);

        return solverId;
    }

    // Procedural animation
    createProceduralAnimator(type: ProceduralAnimationType, config: any): string {
        const animatorId = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const animator: ProceduralAnimator = {
            id: animatorId,
            type,
            config,
            bones: [],
            updateFunction: this.getProceduralUpdateFunction(type),
            enabled: true
        };

        this.proceduralAnimators.set(animatorId, animator);
        console.log(`[AdvancedAnimationSystem] Created procedural animator: ${type}`);

        return animatorId;
    }

    private getProceduralUpdateFunction(type: ProceduralAnimationType): (bone: Bone, time: number, config: any) => void {
        switch (type) {
            case 'walk_cycle':
                return (bone, time, config) => {
                    const speed = config.speed || 1.0;
                    const amplitude = config.amplitude || 1.0;

                    if (bone.name.includes('leg') || bone.name.includes('foot')) {
                        const phase = bone.name.includes('left') ? 0 : Math.PI;
                        const offset = Math.sin(time * speed + phase) * amplitude;

                        const translation = Mat4.create();
                        Mat4.fromTranslation(translation, Vec3.fromValues(0, offset, 0));
                        Mat4.multiply(bone.localTransform, bone.localTransform, translation);
                    }
                };

            case 'breathing':
                return (bone, time, config) => {
                    const speed = config.speed || 1.0;
                    const amplitude = config.amplitude || 0.1;

                    if (bone.name === 'spine' || bone.name === 'chest') {
                        const scale = 1 + Math.sin(time * speed) * amplitude;

                        const scaling = Mat4.create();
                        Mat4.fromScaling(scaling, Vec3.fromValues(1, scale, 1));
                        Mat4.multiply(bone.localTransform, bone.localTransform, scaling);
                    }
                };

            case 'head_tracking':
                return (bone, time, config) => {
                    if (bone.name === 'head' || bone.name === 'neck') {
                        // Would track target position
                        // For now, just add some idle movement
                        const idleRotation = Mat4.create();
                        Mat4.fromRotation(idleRotation, Math.sin(time * 0.5) * 0.1, Vec3.fromValues(0, 1, 0));
                        Mat4.multiply(bone.localTransform, bone.localTransform, idleRotation);
                    }
                };

            case 'tail_wag':
                return (bone, time, config) => {
                    if (bone.name.includes('tail')) {
                        const wagSpeed = config.speed || 2.0;
                        const wagAmplitude = config.amplitude || 0.5;

                        const rotation = Mat4.create();
                        Mat4.fromRotation(rotation, Math.sin(time * wagSpeed) * wagAmplitude, Vec3.fromValues(0, 0, 1));
                        Mat4.multiply(bone.localTransform, bone.localTransform, rotation);
                    }
                };

            case 'ear_twitch':
                return (bone, time, config) => {
                    if (bone.name.includes('ear')) {
                        const twitchSpeed = config.speed || 3.0;
                        const twitchAmplitude = config.amplitude || 0.2;

                        const rotation = Mat4.create();
                        Mat4.fromRotation(rotation, Math.sin(time * twitchSpeed) * twitchAmplitude, Vec3.fromValues(0, 0, 1));
                        Mat4.multiply(bone.localTransform, bone.localTransform, rotation);
                    }
                };

            default:
                return () => {}; // No-op
        }
    }

    // Animation playback
    playAnimation(entity: Entity, animationId: string, fadeInTime: number = 0): ActiveAnimation {
        const animation = this.animations.get(animationId);
        if (!animation) {
            throw new Error(`Animation ${animationId} not found`);
        }

        // Get or create active animation from pool
        const activeAnim = this.getActiveAnimationFromPool();
        activeAnim.animationId = animationId;
        activeAnim.entity = entity;
        activeAnim.currentTime = 0;
        activeAnim.speed = animation.speed;
        activeAnim.loop = animation.loop;
        activeAnim.weight = fadeInTime > 0 ? 0 : 1;
        activeAnim.fadeInTime = fadeInTime;
        activeAnim.fadeOutTime = 0;
        activeAnim.blendMode = animation.blendMode;
        activeAnim.enabled = true;

        // Add to entity's active animations
        if (!this.activeAnimations.has(entity)) {
            this.activeAnimations.set(entity, []);
        }
        this.activeAnimations.get(entity)!.push(activeAnim);

        console.log(`[AdvancedAnimationSystem] Playing animation ${animationId} on entity ${entity}`);
        return activeAnim;
    }

    stopAnimation(entity: Entity, animationId: string, fadeOutTime: number = 0): void {
        const activeAnims = this.activeAnimations.get(entity);
        if (!activeAnims) return;

        const activeAnim = activeAnims.find(anim => anim.animationId === animationId);
        if (activeAnim) {
            if (fadeOutTime > 0) {
                activeAnim.fadeOutTime = fadeOutTime;
            } else {
                activeAnim.enabled = false;
                this.returnActiveAnimationToPool(activeAnim);
                activeAnims.splice(activeAnims.indexOf(activeAnim), 1);
            }
        }
    }

    // Update system
    update(world: World, deltaTime: number): void {
        // Update active animations
        for (const [entity, activeAnims] of this.activeAnimations) {
            for (let i = activeAnims.length - 1; i >= 0; i--) {
                const activeAnim = activeAnims[i];

                if (!activeAnim.enabled) {
                    activeAnims.splice(i, 1);
                    this.returnActiveAnimationToPool(activeAnim);
                    continue;
                }

                this.updateActiveAnimation(activeAnim, deltaTime);
            }

            if (activeAnims.length === 0) {
                this.activeAnimations.delete(entity);
            }
        }

        // Update blend trees
        this.updateBlendTrees(deltaTime);

        // Update state machines
        this.updateStateMachines(deltaTime);

        // Apply IK solvers
        this.applyIKSolvers(world);

        // Apply procedural animation
        this.applyProceduralAnimation(world, deltaTime);

        // Calculate final bone transforms
        this.calculateBoneTransforms(world);

        // Update blend states
        this.updateBlendStates(deltaTime);
    }

    private updateActiveAnimation(activeAnim: ActiveAnimation, deltaTime: number): void {
        const animation = this.animations.get(activeAnim.animationId);
        if (!animation) return;

        // Update timing
        activeAnim.currentTime += deltaTime * activeAnim.speed;

        // Handle looping
        if (activeAnim.loop) {
            activeAnim.currentTime = activeAnim.currentTime % animation.duration;
        } else if (activeAnim.currentTime >= animation.duration) {
            activeAnim.currentTime = animation.duration;
            activeAnim.enabled = false;
        }

        // Update fade in/out
        if (activeAnim.fadeInTime > 0) {
            activeAnim.weight = Math.min(activeAnim.weight + deltaTime / activeAnim.fadeInTime, 1);
        }

        if (activeAnim.fadeOutTime > 0) {
            activeAnim.weight = Math.max(activeAnim.weight - deltaTime / activeAnim.fadeOutTime, 0);
            if (activeAnim.weight <= 0) {
                activeAnim.enabled = false;
            }
        }

        // Apply animation to entity
        this.applyAnimationToEntity(activeAnim.entity, animation, activeAnim.currentTime, activeAnim.weight, activeAnim.blendMode);
    }

    private applyAnimationToEntity(entity: Entity, animation: AnimationClip, time: number, weight: number, blendMode: BlendMode): void {
        // Find relevant keyframes
        const relevantKeyframes = animation.keyframes.filter(keyframe => keyframe.time <= time);
        if (relevantKeyframes.length === 0) return;

        // Interpolate between keyframes
        for (const keyframe of relevantKeyframes) {
            // Apply keyframe data based on target type
            this.applyKeyframeToEntity(entity, keyframe, weight, blendMode);
        }
    }

    private applyKeyframeToEntity(entity: Entity, keyframe: Keyframe, weight: number, blendMode: BlendMode): void {
        // Apply keyframe based on target type
        switch (keyframe.targetType) {
            case 'transform':
                this.applyTransformKeyframe(entity, keyframe, weight, blendMode);
                break;
            case 'bone':
                this.applyBoneKeyframe(entity, keyframe, weight, blendMode);
                break;
            case 'property':
                this.applyPropertyKeyframe(entity, keyframe, weight, blendMode);
                break;
        }
    }

    private applyTransformKeyframe(entity: Entity, keyframe: Keyframe, weight: number, blendMode: BlendMode): void {
        // Would apply to entity's transform component
        // Simplified for demonstration
    }

    private applyBoneKeyframe(entity: Entity, keyframe: Keyframe, weight: number, blendMode: BlendMode): void {
        const boneTransforms = this.boneTransforms.get(entity);
        if (!boneTransforms) return;

        const boneIndex = keyframe.targetIndex || 0;
        if (boneIndex >= boneTransforms.length) return;

        // Apply bone transform
        const boneMatrix = boneTransforms[boneIndex];

        if (keyframe.position) {
            Mat4.fromTranslation(boneMatrix, keyframe.position);
        }

        if (keyframe.rotation) {
            const rotationMatrix = Mat4.create();
            Mat4.fromQuat(rotationMatrix, keyframe.rotation);
            Mat4.multiply(boneMatrix, boneMatrix, rotationMatrix);
        }

        if (keyframe.scale) {
            const scaleMatrix = Mat4.create();
            Mat4.fromScaling(scaleMatrix, keyframe.scale);
            Mat4.multiply(boneMatrix, boneMatrix, scaleMatrix);
        }
    }

    private applyPropertyKeyframe(entity: Entity, keyframe: Keyframe, weight: number, blendMode: BlendMode): void {
        // Apply to component properties
        // Simplified for demonstration
    }

    private updateBlendTrees(deltaTime: number): void {
        // Update blend tree evaluations
        for (const blendTree of this.blendTrees.values()) {
            this.evaluateBlendTree(blendTree, deltaTime);
        }
    }

    private evaluateBlendTree(blendTree: BlendTree, deltaTime: number): void {
        if (!blendTree.rootNode) return;

        // Evaluate the blend tree
        const result = this.evaluateBlendNode(blendTree.rootNode, blendTree.parameters);

        // Apply result to entity
        if (result.entity) {
            this.applyBlendResult(result.entity, result);
        }
    }

    private evaluateBlendNode(node: BlendNode, parameters: BlendParameter[]): BlendResult {
        switch (node.type) {
            case 'clip':
                return { entity: node.entity, animationId: node.animationId!, weight: 1.0 };

            case 'blend':
                const param = parameters.find(p => p.name === node.parameter);
                if (!param) return { entity: node.entity, weight: 0 };

                const blendValue = param.value;
                const child1 = this.evaluateBlendNode(node.children![0], parameters);
                const child2 = this.evaluateBlendNode(node.children![1], parameters);

                return {
                    entity: node.entity,
                    animationId: blendValue < 0.5 ? child1.animationId : child2.animationId,
                    weight: blendValue
                };

            case 'additive':
                const base = this.evaluateBlendNode(node.children![0], parameters);
                const additive = this.evaluateBlendNode(node.children![1], parameters);

                return {
                    entity: node.entity,
                    animationId: base.animationId,
                    additiveAnimationId: additive.animationId,
                    additiveWeight: 1.0
                };

            default:
                return { entity: node.entity, weight: 0 };
        }
    }

    private applyBlendResult(entity: Entity, result: BlendResult): void {
        if (result.animationId) {
            // Ensure animation is playing with correct weight
            const activeAnims = this.activeAnimations.get(entity) || [];
            const existingAnim = activeAnims.find(anim => anim.animationId === result.animationId);

            if (existingAnim) {
                existingAnim.weight = result.weight;
            } else {
                this.playAnimation(entity, result.animationId);
            }
        }

        if (result.additiveAnimationId) {
            // Apply additive animation
            const activeAnims = this.activeAnimations.get(entity) || [];
            const existingAdditive = activeAnims.find(anim => anim.animationId === result.additiveAnimationId);

            if (existingAdditive) {
                existingAdditive.weight = result.additiveWeight || 0;
            } else {
                const additiveAnim = this.playAnimation(entity, result.additiveAnimationId);
                additiveAnim.blendMode = 'additive';
            }
        }
    }

    private updateStateMachines(deltaTime: number): void {
        for (const stateMachine of this.stateMachines.values()) {
            this.updateStateMachine(stateMachine, deltaTime);
        }
    }

    private updateStateMachine(stateMachine: AnimationStateMachine, deltaTime: number): void {
        // Check transitions
        const currentState = stateMachine.states.find(s => s.name === stateMachine.currentState);
        if (!currentState) return;

        for (const transition of currentState.transitions) {
            if (this.evaluateTransition(transition, stateMachine.parameters)) {
                // Change state
                stateMachine.currentState = transition.targetState;

                // Play new animation
                if (transition.animationId) {
                    // Stop current animations and play new one
                    // Simplified for demonstration
                }

                break;
            }
        }

        // Check any state transitions
        for (const transition of stateMachine.anyStateTransitions) {
            if (this.evaluateTransition(transition, stateMachine.parameters)) {
                stateMachine.currentState = transition.targetState;
                break;
            }
        }
    }

    private evaluateTransition(transition: StateTransition, parameters: Map<string, any>): boolean {
        // Evaluate transition conditions
        for (const condition of transition.conditions) {
            const paramValue = parameters.get(condition.parameter);

            switch (condition.type) {
                case 'bool':
                    if (paramValue !== condition.value) return false;
                    break;
                case 'int':
                    if (condition.comparison === 'equals' && paramValue !== condition.value) return false;
                    if (condition.comparison === 'greater' && paramValue <= condition.value) return false;
                    if (condition.comparison === 'less' && paramValue >= condition.value) return false;
                    break;
                case 'float':
                    if (condition.comparison === 'equals' && Math.abs(paramValue - condition.value) > condition.threshold) return false;
                    if (condition.comparison === 'greater' && paramValue <= condition.value) return false;
                    if (condition.comparison === 'less' && paramValue >= condition.value) return false;
                    break;
                case 'trigger':
                    if (!condition.triggered) return false;
                    condition.triggered = false; // Reset trigger
                    break;
            }
        }

        return true;
    }

    private applyIKSolvers(world: World): void {
        for (const solver of this.ikSolvers.values()) {
            if (!solver.enabled) continue;

            this.solveIK(solver, world);
        }
    }

    private solveIK(solver: IKSolver, world: World): void {
        switch (solver.type) {
            case 'ccd':
                this.solveCCD(solver);
                break;
            case 'fabrik':
                this.solveFABRIK(solver);
                break;
            case 'two_bone':
                this.solveTwoBone(solver);
                break;
        }
    }

    private solveCCD(solver: IKSolver): void {
        // Cyclic Coordinate Descent IK solver
        for (let iteration = 0; iteration < solver.maxIterations; iteration++) {
            // Implementation would iterate through bones and adjust rotations
            // to move end effector towards target

            // Simplified for demonstration
            const endEffector = solver.bones[solver.bones.length - 1];
            const target = solver.target;

            // Check if we're close enough to target
            const distance = Vec3.distance(endEffector as any, target);
            if (distance < solver.tolerance) break;

            // Adjust bone rotations from end to start
            for (let i = solver.bones.length - 2; i >= 0; i--) {
                // Calculate rotation needed to move end effector towards target
                // This is a complex mathematical operation
            }
        }
    }

    private solveFABRIK(solver: IKSolver): void {
        // Forward And Backward Reaching Inverse Kinematics
        // More efficient than CCD for long chains

        // Forward pass
        // Backward pass

        // This is a complex algorithm - simplified for demonstration
    }

    private solveTwoBone(solver: IKSolver): void {
        // Analytic solution for two-bone IK
        if (solver.bones.length !== 2) return;

        const bone1 = solver.bones[0];
        const bone2 = solver.bones[1];
        const target = solver.target;

        // Calculate angles using trigonometry
        // Simplified implementation
    }

    private applyProceduralAnimation(world: World, deltaTime: number): void {
        const currentTime = performance.now() / 1000;

        for (const animator of this.proceduralAnimators.values()) {
            if (!animator.enabled) continue;

            for (const boneName of animator.bones) {
                // Find bone and apply procedural animation
                // This would require iterating through all skeletons
                // Simplified for demonstration
            }
        }
    }

    private calculateBoneTransforms(world: World): void {
        // Calculate final bone transforms for all entities with skeletons
        for (const entity of world.getEntitiesWithComponents('skeleton')) {
            const skeletonComponent = world.getComponent(entity, 'skeleton');
            if (!skeletonComponent) continue;

            const skeleton = this.skeletons.get(skeletonComponent.skeletonId);
            if (!skeleton) continue;

            // Calculate bone transforms
            const boneTransforms = this.getBoneTransformsFromPool(skeleton.bones.length);

            this.calculateSkeletonPose(skeleton, boneTransforms);

            this.boneTransforms.set(entity, boneTransforms);
        }
    }

    private calculateSkeletonPose(skeleton: Skeleton, boneTransforms: Mat4[]): void {
        // Calculate world transforms for all bones
        for (let i = 0; i < skeleton.bones.length; i++) {
            const bone = skeleton.bones[i];

            // Start with local transform
            Mat4.copy(boneTransforms[i], bone.localTransform);

            // Apply parent transforms
            if (bone.parent !== -1) {
                Mat4.multiply(boneTransforms[i], boneTransforms[bone.parent], boneTransforms[i]);
            }

            // Apply bind pose inverse to get final transform
            Mat4.multiply(boneTransforms[i], boneTransforms[i], skeleton.inverseBindPose[i]);
        }
    }

    private updateBlendStates(deltaTime: number): void {
        // Update blend weights and transitions
        for (const [entity, blendState] of this.blendStates) {
            // Update blend parameters over time
            for (const param of blendState.parameters) {
                if (param.targetValue !== undefined) {
                    const diff = param.targetValue - param.currentValue;
                    const step = param.blendSpeed * deltaTime;

                    if (Math.abs(diff) < step) {
                        param.currentValue = param.targetValue;
                        param.targetValue = undefined;
                    } else {
                        param.currentValue += Math.sign(diff) * step;
                    }
                }
            }
        }
    }

    // Rendering
    render(world: World, viewMatrix: Mat4, projectionMatrix: Mat4): void {
        const gl = this.gl;

        // Set up animation shader
        gl.useProgram(this.animationShader);

        const viewProjection = Mat4.create();
        Mat4.multiply(viewProjection, projectionMatrix, viewMatrix);

        // Render entities with skeletal animation
        for (const entity of world.getEntitiesWithComponents('skeleton', 'mesh')) {
            this.renderSkeletalEntity(entity, world, viewProjection);
        }
    }

    private renderSkeletalEntity(entity: Entity, world: World, viewProjection: Mat4): void {
        const gl = this.gl;

        const skeletonComponent = world.getComponent(entity, 'skeleton');
        const meshComponent = world.getComponent(entity, 'mesh');

        if (!skeletonComponent || !meshComponent) return;

        const boneTransforms = this.boneTransforms.get(entity);
        if (!boneTransforms) return;

        // Upload bone matrices to GPU
        const boneData = new Float32Array(this.maxBones * 16);
        for (let i = 0; i < Math.min(boneTransforms.length, this.maxBones); i++) {
            for (let j = 0; j < 16; j++) {
                boneData[i * 16 + j] = boneTransforms[i][j];
            }
        }

        gl.bindBuffer(gl.TEXTURE_BUFFER, this.boneBuffer);
        gl.bufferSubData(gl.TEXTURE_BUFFER, 0, boneData);

        // Set uniforms
        const modelViewProjectionLoc = gl.getUniformLocation(this.animationShader!, 'u_modelViewProjection');
        const useSkinningLoc = gl.getUniformLocation(this.animationShader!, 'u_useSkinning');

        // Would set model-view-projection matrix here
        gl.uniform1i(useSkinningLoc, 1);

        // Set bone matrices
        for (let i = 0; i < Math.min(boneTransforms.length, this.maxBones); i++) {
            const boneMatrixLoc = gl.getUniformLocation(this.animationShader!, `u_boneMatrices[${i}]`);
            gl.uniformMatrix4fv(boneMatrixLoc, false, boneTransforms[i]);
        }

        // Render mesh
        // This would bind VAO and draw mesh geometry
    }

    // Pool management
    private getActiveAnimationFromPool(): ActiveAnimation {
        if (this.animationPool.length > 0) {
            return this.animationPool.pop()!;
        }

        return {
            animationId: '',
            entity: '',
            currentTime: 0,
            speed: 1,
            loop: false,
            weight: 1,
            fadeInTime: 0,
            fadeOutTime: 0,
            blendMode: 'override',
            enabled: true
        };
    }

    private returnActiveAnimationToPool(animation: ActiveAnimation): void {
        this.animationPool.push(animation);
    }

    private getBoneTransformsFromPool(count: number): Mat4[] {
        const transforms: Mat4[] = [];

        for (let i = 0; i < count; i++) {
            if (this.transformPool.length > 0) {
                transforms.push(this.transformPool.pop()!);
            } else {
                transforms.push(Mat4.create());
            }
        }

        return transforms;
    }

    // Getters and setters
    getAnimation(animationId: string): AnimationClip | undefined {
        return this.animations.get(animationId);
    }

    getSkeleton(skeletonId: string): Skeleton | undefined {
        return this.skeletons.get(skeletonId);
    }

    getBlendTree(treeId: string): BlendTree | undefined {
        return this.blendTrees.get(treeId);
    }

    getStateMachine(smId: string): AnimationStateMachine | undefined {
        return this.stateMachines.get(smId);
    }

    // Set animation parameters
    setAnimationParameter(entity: Entity, parameterName: string, value: any): void {
        // Set parameter for state machines and blend trees
        for (const stateMachine of this.stateMachines.values()) {
            if (stateMachine.parameters.has(parameterName)) {
                stateMachine.parameters.set(parameterName, value);
            }
        }

        for (const blendTree of this.blendTrees.values()) {
            const param = blendTree.parameters.find(p => p.name === parameterName);
            if (param) {
                param.value = value;
            }
        }
    }

    // Enable/disable advanced features
    enableMotionCapture(enabled: boolean): void {
        this.motionCapture = enabled;
    }

    enableFacialAnimation(enabled: boolean): void {
        this.facialAnimation = enabled;
    }

    enableClothAnimation(enabled: boolean): void {
        this.clothAnimation = enabled;
    }

    enableParticleAnimation(enabled: boolean): void {
        this.particleAnimation = enabled;
    }

    // Debug and profiling
    getDebugInfo(): any {
        return {
            animations: this.animations.size,
            skeletons: this.skeletons.size,
            blendTrees: this.blendTrees.size,
            stateMachines: this.stateMachines.size,
            ikSolvers: this.ikSolvers.size,
            proceduralAnimators: this.proceduralAnimators.size,
            activeAnimations: Array.from(this.activeAnimations.values()).reduce((sum, anims) => sum + anims.length, 0),
            motionCapture: this.motionCapture,
            facialAnimation: this.facialAnimation,
            clothAnimation: this.clothAnimation,
            particleAnimation: this.particleAnimation
        };
    }

    // Cleanup
    dispose(): void {
        const gl = this.gl;

        if (this.animationShader) gl.deleteProgram(this.animationShader);
        if (this.boneTexture) gl.deleteTexture(this.boneTexture);
        if (this.boneBuffer) gl.deleteBuffer(this.boneBuffer);

        this.animations.clear();
        this.skeletons.clear();
        this.blendTrees.clear();
        this.stateMachines.clear();
        this.ikSolvers.clear();
        this.proceduralAnimators.clear();
        this.activeAnimations.clear();
        this.boneTransforms.clear();
        this.blendStates.clear();

        this.animationPool.length = 0;
        this.transformPool.length = 0;

        console.log('[AdvancedAnimationSystem] Disposed');
    }
}

// Type definitions
interface AnimationClip {
    id: string;
    name: string;
    duration: number;
    keyframes: Keyframe[];
    loop: boolean;
    speed: number;
    blendMode: BlendMode;
    events: AnimationEvent[];
}

interface Keyframe {
    time: number;
    targetType: 'transform' | 'bone' | 'property';
    targetIndex?: number;
    position?: Vec3;
    rotation?: Vec4; // Quaternion
    scale?: Vec3;
    propertyValue?: any;
    interpolation: 'linear' | 'cubic' | 'step';
    easing?: EasingFunction;
}

interface Bone {
    name: string;
    parent: number;
    localTransform: Mat4;
    bindPose: Mat4;
    length: number;
}

interface Skeleton {
    id: string;
    name: string;
    bones: Bone[];
    boneMap: Map<string, Bone>;
    rootBone: Bone;
    bindPose: Mat4[];
    inverseBindPose: Mat4[];
}

type BlendTreeType = '1d' | '2d_simple' | '2d_freeform' | 'directional';

interface BlendTree {
    id: string;
    name: string;
    type: BlendTreeType;
    parameters: BlendParameter[];
    nodes: BlendNode[];
    rootNode: BlendNode | null;
    transitions: BlendTransition[];
}

interface BlendParameter {
    name: string;
    type: 'float' | 'int' | 'bool';
    value: any;
    min?: number;
    max?: number;
}

interface BlendNode {
    id: string;
    type: 'clip' | 'blend' | 'additive';
    animationId?: string;
    parameter?: string;
    children?: BlendNode[];
    position?: Vec2; // For 2D blend trees
    threshold?: number; // For 1D blend trees
}

interface BlendTransition {
    fromNode: string;
    toNode: string;
    duration: number;
    conditions: TransitionCondition[];
}

interface AnimationState {
    name: string;
    animationId: string;
    speed: number;
    loop: boolean;
    transitions: StateTransition[];
}

interface StateTransition {
    targetState: string;
    animationId?: string;
    duration: number;
    conditions: TransitionCondition[];
}

interface TransitionCondition {
    parameter: string;
    type: 'bool' | 'int' | 'float' | 'trigger';
    comparison?: 'equals' | 'greater' | 'less';
    value: any;
    threshold?: number;
    triggered?: boolean;
}

interface AnimationStateMachine {
    id: string;
    name: string;
    states: AnimationState[];
    transitions: StateTransition[];
    currentState: string;
    parameters: Map<string, any>;
    anyStateTransitions: StateTransition[];
}

interface IKSolver {
    id: string;
    type: 'ccd' | 'fabrik' | 'two_bone';
    bones: string[];
    target: Vec3;
    constraints: IKConstraint[];
    maxIterations: number;
    tolerance: number;
    enabled: boolean;
}

interface IKConstraint {
    boneIndex: number;
    type: 'hinge' | 'ball' | 'fixed';
    axis?: Vec3;
    limit?: number;
}

type ProceduralAnimationType = 'walk_cycle' | 'breathing' | 'head_tracking' | 'tail_wag' | 'ear_twitch';

interface ProceduralAnimator {
    id: string;
    type: ProceduralAnimationType;
    config: any;
    bones: string[];
    updateFunction: (bone: Bone, time: number, config: any) => void;
    enabled: boolean;
}

interface ActiveAnimation {
    animationId: string;
    entity: Entity;
    currentTime: number;
    speed: number;
    loop: boolean;
    weight: number;
    fadeInTime: number;
    fadeOutTime: number;
    blendMode: BlendMode;
    enabled: boolean;
}

type BlendMode = 'override' | 'additive' | 'multiplicative';

interface BlendState {
    entity: Entity;
    parameters: BlendParameterState[];
}

interface BlendParameterState {
    name: string;
    currentValue: number;
    targetValue?: number;
    blendSpeed: number;
}

interface BlendResult {
    entity: Entity;
    animationId?: string;
    weight?: number;
    additiveAnimationId?: string;
    additiveWeight?: number;
}

interface AnimationEvent {
    time: number;
    eventName: string;
    parameters: any[];
}

type EasingFunction = 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out' | 'bounce' | 'elastic';
