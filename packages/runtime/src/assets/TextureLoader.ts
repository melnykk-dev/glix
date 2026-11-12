export class TextureLoader {
    constructor(private gl: WebGL2RenderingContext) { }

    async load(url: string): Promise<WebGLTexture> {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                const texture = this.gl.createTexture();
                if (!texture) {
                    reject(new Error('Failed to create WebGL texture'));
                    return;
                }

                this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
                this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
                this.gl.generateMipmap(this.gl.TEXTURE_2D);

                // Standard pixel-art settings
                this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST_MIPMAP_LINEAR);
                this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);

                resolve(texture);
            };
            image.onerror = (err) => reject(err);
            image.src = url;
        });
    }
}
