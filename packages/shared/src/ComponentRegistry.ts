import { ComponentType, ComponentMap } from './types';

export const ComponentRegistry: { [K in ComponentType]: ComponentMap[K] } = {
    transform: {
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        parent: undefined,
    },
    sprite: {
        textureId: '',
        tintColor: '#6366F1',
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
        src: `class MyScript extends ScriptComponent {
  onStart() {
    // Called once when the game starts
  }

  onUpdate(dt: number) {
    // Called every frame — dt is delta time in seconds
  }

  onCollision(other: Entity) {
    // Called when this entity touches another
  }

  onCollisionExit(other: Entity) {
    // Called when this entity stops touching another
  }
}

export default MyScript;`,
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
        vertSrc: `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;
uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_model;
out vec2 v_texCoord;
void main() {
  gl_Position = u_projection * u_view * u_model * vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`,
        fragSrc: `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec4 u_tint;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_texCoord) * u_tint;
}`,
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
    camera: {
        followTarget: undefined,
        zoom: 1,
        smooth: 5,
        offsetX: 0,
        offsetY: 0,
    },
};

export function getDefaultComponent<K extends ComponentType>(type: K): ComponentMap[K] {
    return JSON.parse(JSON.stringify(ComponentRegistry[type]));
}
