import { ShaderMaterialComponent } from '@glix/shared';

export const createShaderMaterial = (
    vertSrc: string,
    fragSrc: string,
    uniforms: Record<string, any> = {}
): ShaderMaterialComponent => ({
    vertSrc,
    fragSrc,
    uniforms,
});
