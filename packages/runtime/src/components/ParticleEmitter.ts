import { ParticleEmitterComponent } from '@glix/shared';

export const createParticleEmitter = (
    maxParticles: number = 100,
    emissionRate: number = 10,
    lifetime: number = 1.0,
    startSize: number = 10,
    endSize: number = 0,
    startColor: [number, number, number, number] = [1, 1, 1, 1],
    endColor: [number, number, number, number] = [1, 1, 1, 0],
    speed: number = 50,
    spread: number = 3.1415,
    texture: string = ''
): ParticleEmitterComponent => ({
    maxParticles,
    emissionRate,
    lifetime,
    startSize,
    endSize,
    startColor,
    endColor,
    speed,
    spread,
    texture,
});
