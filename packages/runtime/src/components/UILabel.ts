import { UILabelComponent } from '@glix/shared';

export const createUILabel = (
    text: string = 'Text',
    fontSize: number = 16,
    color: string = '#ffffff',
    fontFamily: string = 'Arial'
): UILabelComponent => ({
    text,
    fontSize,
    color,
    fontFamily,
});
