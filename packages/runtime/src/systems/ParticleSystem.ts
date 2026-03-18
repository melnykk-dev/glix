import { World } from '../core/World';
import { Mat4 } from '../math';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    startSize: number;
    endSize: number;
    startColor: [number, number, number, number];
    endColor: [number, number, number, number];
}

class EmitterState {
    particles: Particle[] = [];
    accumulator: number = 0;
}

export class ParticleSystem {
    private program: WebGLProgram;
    private quadBuffer: WebGLBuffer;
    private instanceBuffer: WebGLBuffer;
    private states: Map<string, EmitterState> = new Map();

    constructor(private gl: WebGL2RenderingContext) {
        const vsSource = `#version 300 es
            layout(location = 0) in vec2 a_position;
            layout(location = 1) in vec2 a_texCoord;
            
            // instance data
            layout(location = 2) in vec2 a_instPos;
            layout(location = 3) in float a_instSize;
            layout(location = 4) in vec4 a_instColor;

            uniform mat4 u_projection;
            uniform mat4 u_view;

            out vec2 v_texCoord;
            out vec4 v_color;

            void main() {
                vec2 pos = (a_position * a_instSize) + a_instPos;
                gl_Position = u_projection * u_view * vec4(pos, 0.0, 1.0);
                v_texCoord = a_texCoord;
                v_color = a_instColor;
            }
        `;

        const fsSource = `#version 300 es
            precision mediump float;
            in vec2 v_texCoord;
            in vec4 v_color;
            uniform sampler2D u_texture;
            uniform bool u_useTexture;
            
            out vec4 outColor;

            void main() {
                if (u_useTexture) {
                    vec4 texColor = texture(u_texture, v_texCoord);
                    outColor = texColor * v_color;
                } else {
                    // default circle particle
                    vec2 uv = v_texCoord * 2.0 - 1.0;
                    float dist = dot(uv, uv);
                    if (dist > 1.0) discard;
                    outColor = v_color;
                }
            }
        `;

        this.program = this.createProgram(vsSource, fsSource)!;
        this.quadBuffer = this.createQuadBuffer();
        this.instanceBuffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, 10000 * 7 * 4, this.gl.DYNAMIC_DRAW);
    }

    private createShader(type: number, source: string): WebGLShader | null {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    private createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
        const vs = this.createShader(this.gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(this.gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;
        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vs);
        this.gl.attachShader(program, fs);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error(this.gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }

    private createQuadBuffer(): WebGLBuffer {
        const vertices = new Float32Array([
            -0.5, -0.5, 0, 1,
            0.5, -0.5, 1, 1,
            -0.5, 0.5, 0, 0,
            0.5, 0.5, 1, 0,
        ]);
        const buffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        return buffer;
    }

    updateAndRenderEmitter(
        entity: string,
        world: World,
        dt: number, // delta time in seconds
        viewMatrix: Mat4,
        projectionMatrix: Mat4,
        textures: Map<string, WebGLTexture>
    ): void {
        const transform = world.getComponent(entity, 'transform')!;
        const emitter = world.getComponent(entity, 'particleEmitter')!;

        if (!this.states.has(entity)) {
            this.states.set(entity, new EmitterState());
        }
        const state = this.states.get(entity)!;

        // Emit new particles
        if (emitter.emissionRate > 0) {
            state.accumulator += dt * emitter.emissionRate;
            const toEmit = Math.floor(state.accumulator);
            state.accumulator -= toEmit;

            for (let i = 0; i < toEmit; i++) {
                if (state.particles.length < emitter.maxParticles) {
                    const angle = (Math.random() - 0.5) * emitter.spread + transform.rotation;
                    const speed = emitter.speed * (0.8 + Math.random() * 0.4);

                    state.particles.push({
                        x: transform.x,
                        y: transform.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        life: emitter.lifetime,
                        maxLife: emitter.lifetime,
                        startSize: emitter.startSize,
                        endSize: emitter.endSize,
                        startColor: [...emitter.startColor],
                        endColor: [...emitter.endColor]
                    });
                }
            }
        }

        // Update and build instance data
        let activeCount = 0;
        const instanceData = new Float32Array(state.particles.length * 7);

        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.life -= dt;

            if (p.life <= 0) {
                // swap with last and pop
                state.particles[i] = state.particles[state.particles.length - 1];
                state.particles.pop();
                continue;
            }

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            const t = 1.0 - (p.life / p.maxLife);
            const currentSize = p.startSize + (p.endSize - p.startSize) * t;
            const r = p.startColor[0] + (p.endColor[0] - p.startColor[0]) * t;
            const g = p.startColor[1] + (p.endColor[1] - p.startColor[1]) * t;
            const b = p.startColor[2] + (p.endColor[2] - p.startColor[2]) * t;
            const a = p.startColor[3] + (p.endColor[3] - p.startColor[3]) * t;

            const offset = activeCount * 7;
            instanceData[offset + 0] = p.x;
            instanceData[offset + 1] = p.y;
            instanceData[offset + 2] = currentSize;
            instanceData[offset + 3] = r;
            instanceData[offset + 4] = g;
            instanceData[offset + 5] = b;
            instanceData[offset + 6] = a;

            activeCount++;
        }

        // Render
        if (activeCount > 0) {
            this.gl.useProgram(this.program);
            const uProj = this.gl.getUniformLocation(this.program, 'u_projection');
            const uView = this.gl.getUniformLocation(this.program, 'u_view');
            const uTexture = this.gl.getUniformLocation(this.program, 'u_texture');
            const uUseTexture = this.gl.getUniformLocation(this.program, 'u_useTexture');

            this.gl.uniformMatrix4fv(uProj, false, projectionMatrix);
            this.gl.uniformMatrix4fv(uView, false, viewMatrix);
            this.gl.uniform1i(uTexture, 0);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
            this.gl.enableVertexAttribArray(0);
            this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 16, 0);
            this.gl.enableVertexAttribArray(1);
            this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 16, 8);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
            this.gl.enableVertexAttribArray(2);
            this.gl.vertexAttribPointer(2, 2, this.gl.FLOAT, false, 28, 0);
            this.gl.vertexAttribDivisor(2, 1);

            this.gl.enableVertexAttribArray(3);
            this.gl.vertexAttribPointer(3, 1, this.gl.FLOAT, false, 28, 8);
            this.gl.vertexAttribDivisor(3, 1);

            this.gl.enableVertexAttribArray(4);
            this.gl.vertexAttribPointer(4, 4, this.gl.FLOAT, false, 28, 12);
            this.gl.vertexAttribDivisor(4, 1);

            this.gl.enable(this.gl.BLEND);
            this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE);

            if (emitter.texture && textures.has(emitter.texture)) {
                this.gl.uniform1i(uUseTexture, 1);
                this.gl.activeTexture(this.gl.TEXTURE0);
                this.gl.bindTexture(this.gl.TEXTURE_2D, textures.get(emitter.texture)!);
            } else {
                this.gl.uniform1i(uUseTexture, 0);
            }

            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, instanceData.subarray(0, activeCount * 7));
            this.gl.drawArraysInstanced(this.gl.TRIANGLE_STRIP, 0, 4, activeCount);

            this.gl.vertexAttribDivisor(2, 0);
            this.gl.vertexAttribDivisor(3, 0);
            this.gl.vertexAttribDivisor(4, 0);
            this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        }
    }

    cleanup(activeEntities: Set<string>): void {
        for (const [entityId] of this.states) {
            if (!activeEntities.has(entityId)) {
                this.states.delete(entityId);
            }
        }
    }
}
