import { FrameAnimationComponent } from '@glix/shared';

export const createFrameAnimation = (
    atlasId: string,
    frames: string[],
    fps: number = 10,
    loop: boolean = true
): FrameAnimationComponent => ({
    atlasId,
    frames,
    fps,
    loop,
    currentFrame: 0,
    elapsed: 0,
    isPlaying: true,
});
