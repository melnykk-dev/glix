import { UIPanelComponent } from '@glix/shared';

export const createUIPanel = (
    width: number = 200,
    height: number = 200,
    color: string = '#222222',
    borderRadius: number = 0
): UIPanelComponent => ({
    width,
    height,
    color,
    borderRadius,
});
