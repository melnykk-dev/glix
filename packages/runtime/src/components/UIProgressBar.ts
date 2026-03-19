import { UIProgressBarComponent } from '@glix/shared';

export const createUIProgressBar = (
    value: number = 100,
    max: number = 100,
    fillColor: string = '#00ff00',
    bgColor: string = '#333333',
    width: number = 200,
    height: number = 20
): UIProgressBarComponent => ({
    value,
    max,
    fillColor,
    bgColor,
    width,
    height,
});
