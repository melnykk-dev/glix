import { ComponentType, ComponentMap } from './types';

export const ComponentRegistry: { [K in ComponentType]: ComponentMap[K] } = {
    transform: {
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
    },
    sprite: {
        textureId: '',
        width: 1,
        height: 1,
        pivotX: 0.5,
        pivotY: 0.5,
    },
    frameAnimation: {
        atlasId: '',
        frames: [],
        fps: 12,
        loop: true,
        currentFrame: 0,
        elapsed: 0,
        isPlaying: true,
    },
    rigidBody: {
        type: 'dynamic',
        gravityScale: 1,
        linearDamping: 0,
        angularDamping: 0,
        fixedRotation: false,
    },
    boxCollider: {
        width: 1,
        height: 1,
        offsetX: 0,
        offsetY: 0,
        isSensor: false,
        restitution: 0,
        friction: 0.2,
    },
    circleCollider: {
        radius: 0.5,
        offsetX: 0,
        offsetY: 0,
        isSensor: false,
        restitution: 0,
        friction: 0.2,
    },
    script: {
        src: '// Write your script here\nclass MyScript extends ScriptComponent {\n  onStart() {\n    console.log("started", this.entity);\n  }\n  onUpdate(dt: number) {\n    // Called every frame\n  }\n  onDestroy() {}\n}\n\nexport default MyScript;\n',
        compiledJs: '',
    },
    tilemap: {
        tilesetId: '',
        layers: [],
        tileWidth: 1,
        tileHeight: 1,
    },
    sortingLayer: {
        layer: 0,
        orderInLayer: 0,
    },
    shaderMaterial: {
        vertSrc: '// Basic vertex shader\nattribute vec2 position;\nattribute vec2 uv;\nvarying vec2 vUv;\nuniform mat4 projection;\nuniform mat4 view;\nvoid main() {\n    vUv = uv;\n    gl_Position = projection * view * vec4(position, 0.0, 1.0);\n}',
        fragSrc: '// Basic fragment shader\nprecision mediump float;\nvarying vec2 vUv;\nuniform sampler2D mainTexture;\nvoid main() {\n    gl_FragColor = texture2D(mainTexture, vUv);\n}',
        uniforms: {},
    },
    particleEmitter: {
        maxParticles: 100,
        emissionRate: 10,
        lifetime: 1,
        startSize: 1,
        endSize: 0,
        startColor: [1, 1, 1, 1],
        endColor: [1, 1, 1, 0],
        speed: 1,
        spread: 1,
        texture: '',
    },
    uiCanvas: {},
    uiTransform: {
        anchorX: 0,
        anchorY: 0,
        pivotX: 0,
        pivotY: 0,
        offsetX: 0,
        offsetY: 0,
    },
    uiLabel: {
        text: 'Text',
        fontSize: 16,
        color: '#ffffff',
        fontFamily: 'Arial',
    },
    uiImage: {
        textureId: '',
        width: 100,
        height: 100,
    },
    uiButton: {
        normalColor: '#888888',
        hoverColor: '#aaaaaa',
        pressColor: '#555555',
        onClick: '',
    },
    uiProgressBar: {
        value: 100,
        max: 100,
        fillColor: '#00ff00',
        bgColor: '#333333',
        width: 200,
        height: 20,
    },
    uiPanel: {
        width: 200,
        height: 200,
        color: '#222222',
        borderRadius: 0,
    },
    persistent: {},
    sceneTransition: {
        type: 'fade',
        duration: 1,
        color: '#000000',
    },
    stateMachine: {
        states: {},
        currentState: '',
    },
};

export function getDefaultComponent<K extends ComponentType>(type: K): ComponentMap[K] {
    // Deep clone to avoid mutating the registry
    return JSON.parse(JSON.stringify(ComponentRegistry[type]));
}
