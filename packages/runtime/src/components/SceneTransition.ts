import { SceneTransitionComponent } from '@glix/shared';

export const createSceneTransition = (
    type: 'fade' | 'slide' = 'fade',
    duration: number = 1,
    color: string = '#000000'
): SceneTransitionComponent => ({
    type,
    duration,
    color,
});
