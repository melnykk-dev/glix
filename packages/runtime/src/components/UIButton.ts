import { UIButtonComponent } from '@glix/shared';

export const createUIButton = (
    normalColor: string = '#888888',
    hoverColor: string = '#aaaaaa',
    pressColor: string = '#555555',
    onClick: string = ''
): UIButtonComponent => ({
    normalColor,
    hoverColor,
    pressColor,
    onClick,
});
