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
    private whiteTexture: WebGLTexture;
    private customPrograms: Map<string, WebGLProgram> = new Map();
    private defaultLocations: Map<string, WebGLUniformLocation | null> = new Map();

    constructor(private gl: WebGL2RenderingContext) {
        this.whiteTexture = this.createWhiteTexture();

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

        // Added u_tint uniform so we can colorize white-texture quads
        const fsSource = `#version 300 es
      precision mediump float;
      in vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform vec4 u_tint;
      out vec4 outColor;

      void main() {
        vec4 texColor = texture(u_texture, v_texCoord);
        outColor = texColor * u_tint;
      }
    `;

        this.program = this.createProgram(vsSource, fsSource)!;
        this.cacheDefaultLocations();
        this.quadBuffer = this.createQuadBuffer();
        this.postProcessStack = new PostProcessStack(gl);
    }

    private cacheDefaultLocations() {
        const uniforms = ['u_projection', 'u_view', 'u_model', 'u_texture', 'u_uvOffset', 'u_uvScale', 'u_tint'];
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

    private createWhiteTexture(): WebGLTexture {
        const gl = this.gl;
        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        const whitePixel = new Uint8Array([255, 255, 255, 255]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, whitePixel);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        return texture;
    }

    private createQuadBuffer(): WebGLBuffer {
        const vertices = new Float32Array([
            -0.5, -0.5, 0, 1,
             0.5, -0.5, 1, 1,
            -0.5,  0.5, 0, 0,
             0.5,  0.5, 1, 0,
        ]);
        const buffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        return buffer;
    }

    update(
        world: World,
        dtSeconds: number,
        viewMatrix: Mat4,
        projectionMatrix: Mat4,
        textures: Map<string, WebGLTexture>,
        atlases: Map<string, SpriteAtlas>,
        tilesets: Map<string, TilesetData>,
        tilemapSystem: TilemapSystem,
        particleSystem: ParticleSystem,
        postProcessConfig: { bloom?: boolean, vignette?: boolean, crt?: boolean } = {}
    ): void {
        const spriteEntities = world.getEntitiesWithComponents('transform', 'sprite');
        const tilemapEntities = world.getEntitiesWithComponents('transform', 'tilemap');
        const particleEntities = world.getEntitiesWithComponents('transform', 'particleEmitter');

        const drawableSet = new Set([...spriteEntities, ...tilemapEntities, ...particleEntities]);
        const drawables = Array.from(drawableSet);

        // Sort by SortingLayer
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

        // Setup FBO for PostProcess
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

        particleSystem.cleanup(new Set(particleEntities));

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.viewport(0, 0, canvas.width, canvas.height);
        this.postProcessStack.render(postProcessConfig);
    }

    private getWorldMatrix(entity: string, world: World): Mat4 {
        const transform = world.getComponent(entity, 'transform')!;
        const model = Mat4.create();
        Mat4.translate(model, model, [transform.x, transform.y, 0]);
        Mat4.rotateZ(model, model, transform.rotation);
        Mat4.scale(model, model, [transform.scaleX, transform.scaleY, 1]);

        if (transform.parent) {
            const parentMatrix = this.getWorldMatrix(transform.parent, world);
            Mat4.multiply(model, parentMatrix, model);
        }

        return model;
    }

    /** Parse a CSS hex/rgb color string → [r, g, b, a] in 0–1 range. */
    private parseColor(color: string): [number, number, number, number] {
        if (!color) return [1, 1, 1, 1];

        // #rrggbb or #rrggbbaa
        const hex = color.match(/^#([0-9a-f]{6,8})$/i);
        if (hex) {
            const h = hex[1];
            const r = parseInt(h.slice(0, 2), 16) / 255;
            const g = parseInt(h.slice(2, 4), 16) / 255;
            const b = parseInt(h.slice(4, 6), 16) / 255;
            const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
            return [r, g, b, a];
        }

        // rgb(r,g,b) or rgba(r,g,b,a)
        const rgba = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgba) {
            return [
                parseInt(rgba[1]) / 255,
                parseInt(rgba[2]) / 255,
                parseInt(rgba[3]) / 255,
                rgba[4] !== undefined ? parseFloat(rgba[4]) : 1,
            ];
        }

        return [1, 1, 1, 1];
    }

    private renderSprite(
        entity: string,
        world: World,
        viewMatrix: Mat4,
        projectionMatrix: Mat4,
        textures: Map<string, WebGLTexture>,
        atlases: Map<string, SpriteAtlas>
    ): void {
        const sprite = world.getComponent(entity, 'sprite')!;

        // Use texture if one is set; otherwise fall back to white so tint shows
        const texture = sprite.textureId ? (textures.get(sprite.textureId) ?? this.whiteTexture) : this.whiteTexture;

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

        const getLoc = (name: string) =>
            isCustom
                ? this.gl.getUniformLocation(currentProgram, name)
                : this.defaultLocations.get(name) || null;

        const uProj    = getLoc('u_projection');
        const uView    = getLoc('u_view');
        const uModel   = getLoc('u_model');
        const uTexture = getLoc('u_texture');
        const uUVOff   = getLoc('u_uvOffset');
        const uUVSc    = getLoc('u_uvScale');
        const uTint    = getLoc('u_tint');

        if (uProj)    this.gl.uniformMatrix4fv(uProj, false, projectionMatrix);
        if (uView)    this.gl.uniformMatrix4fv(uView, false, viewMatrix);
        if (uTexture) this.gl.uniform1i(uTexture, 0);

        // Resolve tint: use sprite.tintColor if set, otherwise magenta for entities without texture
        let tintColor: [number, number, number, number];
        if ((sprite as any).tintColor) {
            tintColor = this.parseColor((sprite as any).tintColor);
        } else if (!sprite.textureId) {
            // Magenta fallback for entities without texture
            tintColor = [1.0, 0.0, 1.0, 1.0]; // Bright magenta #FF00FF
        } else {
            tintColor = [1, 1, 1, 1]; // White for textured sprites
        }

        if (uTint) this.gl.uniform4fv(uTint, tintColor);

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

        const model = this.getWorldMatrix(entity, world);
        Mat4.scale(model, model, [sprite.width, sprite.height, 1]);

        if (uModel) this.gl.uniformMatrix4fv(uModel, false, model);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

        let uvOffset = [0, 0];
        let uvScale  = [1, 1];

        if (sprite.region) {
            for (const atlas of atlases.values()) {
                if (atlas.textureId === sprite.textureId) {
                    const region = atlas.getRegion(sprite.region);
                    if (region) {
                        uvOffset = [region.x, region.y];
                        uvScale  = [region.w, region.h];
                        break;
                    }
                }
            }
        }

        if (uUVOff) this.gl.uniform2fv(uUVOff, uvOffset);
        if (uUVSc)  this.gl.uniform2fv(uUVSc, uvScale);

        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
}
