import { World } from '../core/World';

export class AnimationSystem {
    update(world: World, deltaTime: number): void {
        const entities = world.getEntitiesWithComponents('frameAnimation', 'sprite');

        for (const entity of entities) {
            const anim = world.getComponent(entity, 'frameAnimation')!;
            if (!anim.isPlaying) continue;

            anim.elapsed += deltaTime;
            const frameTime = 1 / anim.fps;

            if (anim.elapsed >= frameTime) {
                anim.elapsed -= frameTime;
                anim.currentFrame++;

                if (anim.currentFrame >= anim.frames.length) {
                    if (anim.loop) {
                        anim.currentFrame = 0;
                    } else {
                        anim.currentFrame = anim.frames.length - 1;
                        anim.isPlaying = false;
                    }
                }

                // Update sprite region
                const sprite = world.getComponent(entity, 'sprite')!;
                sprite.region = anim.frames[anim.currentFrame];
            }
        }
    }
}
