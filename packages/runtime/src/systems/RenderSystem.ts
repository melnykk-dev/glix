import { World } from '../core/World';
import { Mat4 } from '../math';
import { SpriteAtlas } from '../assets/SpriteAtlas';
import { PostProcessStack } from '../renderer/PostProcessStack';
import { TilemapSystem } from './TilemapSystem';
import { ParticleSystem } from './ParticleSystem';
import { TilesetData } from '@glix/shared';

export class RenderSystem {
    private program: WebGLProgram;
    private quadBuffer: WebGLBuffer;
    private postProcessStack: PostProcessStack;
    private customPrograms: Map<string, WebGLProgram> = new Map();
    private defaultLocations: Map<string, WebGLUniformLocation | null> = new Map();

    constructor(private gl: WebGL2RenderingContext) {
        const vsSource = `#version 300 es
      layout(location = 0) in vec2 a_position;
      layout(location = 1) in vec2 a_texCoord;

      uniform mat4 u_projection;
      uniform mat4 u_view;
      uniform mat4 u_model;
      uniform vec2 u_uvOffset;
      uniform vec2 u_uvScale;

      out vec2 v_texCoord;

      void main() {
        gl_Position = u_projection * u_view * u_model * vec4(a_position, 0.0, 1.0);
        v_texCoord = u_uvOffset + a_texCoord * u_uvScale;
      }
    `;

        const fsSource = `#version 300 es
      precision mediump float;
      in vec2 v_texCoord;
      uniform sampler2D u_texture;
      out vec4 outColor;

      void main() {
        outColor = texture(u_texture, v_texCoord);
      }
    `;

        this.program = this.createProgram(vsSource, fsSource)!;
        this.cacheDefaultLocations();
        this.quadBuffer = this.createQuadBuffer();
        this.postProcessStack = new PostProcessStack(gl);
    }

    private cacheDefaultLocations() {
        const uniforms = ['u_projection', 'u_view', 'u_model', 'u_texture', 'u_uvOffset', 'u_uvScale'];
        for (const u of uniforms) {
            this.defaultLocations.set(u, this.gl.getUniformLocation(this.program, u));
        }
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

    update(
        world: World,
        dtSeconds: number, // Need dt to pass to particle system
        viewMatrix: Mat4,
        projectionMatrix: Mat4,
        textures: Map<string, WebGLTexture>,
        atlases: Map<string, SpriteAtlas>,
        tilesets: Map<string, TilesetData>,
        tilemapSystem: TilemapSystem,
        particleSystem: ParticleSystem,
        postProcessConfig: { bloom?: boolean, vignette?: boolean, crt?: boolean } = {}
    ): void {
        // Collect everything that renders
        const spriteEntities = world.getEntitiesWithComponents('transform', 'sprite');
        const tilemapEntities = world.getEntitiesWithComponents('transform', 'tilemap');
        const particleEntities = world.getEntitiesWithComponents('transform', 'particleEmitter');

        const drawableSet = new Set([...spriteEntities, ...tilemapEntities, ...particleEntities]);
        const drawables = Array.from(drawableSet);

        // Sorting by SortingLayer
        drawables.sort((a, b) => {
            const layerA = world.getComponent(a, 'sortingLayer');
            const layerB = world.getComponent(b, 'sortingLayer');
            const lA = layerA?.layer ?? 0;
            const oA = layerA?.orderInLayer ?? 0;
            const lB = layerB?.layer ?? 0;
            const oB = layerB?.orderInLayer ?? 0;
            if (lA !== lB) return lA - lB;
            return oA - oB;
        });

        // Setup FBO PostProcess
        const canvas = this.gl.canvas as HTMLCanvasElement;
        this.postProcessStack.resize(canvas.width, canvas.height);
        this.postProcessStack.bindSceneFramebuffer();
        this.gl.viewport(0, 0, canvas.width, canvas.height);

        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        for (const entity of drawables) {
            if (world.getComponent(entity, 'sprite')) {
                this.renderSprite(entity, world, viewMatrix, projectionMatrix, textures, atlases);
            }
            if (world.getComponent(entity, 'tilemap')) {
                tilemapSystem.renderTilemap(entity, world, viewMatrix, projectionMatrix, textures, tilesets);
            }
            if (world.getComponent(entity, 'particleEmitter')) {
                particleSystem.updateAndRenderEmitter(entity, world, dtSeconds, viewMatrix, projectionMatrix, textures);
            }
        }

        // Clean up deleted particle emitters
        particleSystem.cleanup(new Set(particleEntities));

        // Apply Post Process
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null); // screen
        this.gl.viewport(0, 0, canvas.width, canvas.height);
        this.postProcessStack.render(postProcessConfig);
    }

    private renderSprite(
        entity: string,
        world: World,
        viewMatrix: Mat4,
        projectionMatrix: Mat4,
        textures: Map<string, WebGLTexture>,
        atlases: Map<string, SpriteAtlas>
    ): void {
        const transform = world.getComponent(entity, 'transform')!;
        const sprite = world.getComponent(entity, 'sprite')!;
        const texture = textures.get(sprite.textureId);

        if (!texture) return;

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 16, 0);
        this.gl.enableVertexAttribArray(1);
        this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 16, 8);

        const shaderMaterial = world.getComponent(entity, 'shaderMaterial');
        let currentProgram = this.program;
        let isCustom = false;

        if (shaderMaterial) {
            const key = shaderMaterial.vertSrc + shaderMaterial.fragSrc;
            if (!this.customPrograms.has(key)) {
                const prog = this.createProgram(shaderMaterial.vertSrc, shaderMaterial.fragSrc);
                if (prog) this.customPrograms.set(key, prog);
            }
            currentProgram = this.customPrograms.get(key) || this.program;
            isCustom = currentProgram !== this.program;
        }

        this.gl.useProgram(currentProgram);

        const getLoc = (name: string) => isCustom ? this.gl.getUniformLocation(currentProgram, name) : this.defaultLocations.get(name) || null;

        const uProj = getLoc('u_projection');
        const uView = getLoc('u_view');
        const uModel = getLoc('u_model');
        const uTexture = getLoc('u_texture');
        const uUVOffset = getLoc('u_uvOffset');
        const uUVScale = getLoc('u_uvScale');

        if (uProj) this.gl.uniformMatrix4fv(uProj, false, projectionMatrix);
        if (uView) this.gl.uniformMatrix4fv(uView, false, viewMatrix);
        if (uTexture) this.gl.uniform1i(uTexture, 0);

        if (isCustom && shaderMaterial) {
            for (const [name, val] of Object.entries(shaderMaterial.uniforms)) {
                const loc = this.gl.getUniformLocation(currentProgram, name);
                if (loc) {
                    if (typeof val === 'number') this.gl.uniform1f(loc, val);
                    else if (Array.isArray(val)) {
                        if (val.length === 2) this.gl.uniform2fv(loc, val);
                        else if (val.length === 3) this.gl.uniform3fv(loc, val);
                        else if (val.length === 4) this.gl.uniform4fv(loc, val);
                    }
                }
            }
        }

        const model = Mat4.create();
        Mat4.translate(model, model, [transform.x, transform.y, 0]);
        Mat4.rotateZ(model, model, transform.rotation);
        // Pivot point logic could be here if sprite component had it!
        // wait, earlier RenderSystem just used scaleX * sprite.width
        Mat4.scale(model, model, [transform.scaleX * sprite.width, transform.scaleY * sprite.height, 1]);

        if (uModel) this.gl.uniformMatrix4fv(uModel, false, model);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

        let uvOffset = [0, 0];
        let uvScale = [1, 1];

        if (sprite.region) {
            for (const atlas of atlases.values()) {
                if (atlas.textureId === sprite.textureId) {
                    const region = atlas.getRegion(sprite.region);
                    if (region) {
                        uvOffset = [region.x, region.y];
                        uvScale = [region.w, region.h];
                        break;
                    }
                }
            }
        }

        if (uUVOffset) this.gl.uniform2fv(uUVOffset, uvOffset);
        if (uUVScale) this.gl.uniform2fv(uUVScale, uvScale);

        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
}
