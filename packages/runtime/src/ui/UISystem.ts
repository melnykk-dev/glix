import { World } from '../core/World';
import { InputManager } from '../input/InputManager';
import { EventBus } from '../core/EventBus';

export class UISystem {
    constructor(private eventBus: EventBus) { }

    update(world: World, inputManager: InputManager, canvasWidth: number, canvasHeight: number) {
        // UI entities are those with a uiTransform
        const uiEntities = world.getEntitiesWithComponents('uiTransform');

        const mousePos = inputManager.getMousePosition();
        const mouseX = mousePos.x;
        const mouseY = mousePos.y;
        const isMousePressed = inputManager.isMouseButtonDown(0);
        const isMouseClicked = inputManager.isMouseButtonJustPressed(0);

        // Sort by sortingLayer if needed, but for now just process all
        for (const entity of uiEntities) {
            const transform = world.getComponent(entity, 'uiTransform')!;
            const button = world.getComponent(entity, 'uiButton');

            // Calculate screen bounds based on generic size from panel/button/image
            let width = 0;
            let height = 0;

            const panel = world.getComponent(entity, 'uiPanel');
            const image = world.getComponent(entity, 'uiImage');
            const progress = world.getComponent(entity, 'uiProgressBar');

            if (panel) { width = panel.width; height = panel.height; }
            else if (image) { width = image.width; height = image.height; }
            else if (progress) { width = progress.width; height = progress.height; }
            else if (button) {
                width = 100; height = 40; // Fallback
            }

            // Calculate position
            const x = (transform.anchorX * canvasWidth) + transform.offsetX - (transform.pivotX * width);
            const y = (transform.anchorY * canvasHeight) + transform.offsetY - (transform.pivotY * height);

            if (button) {
                // Hit test
                const isHovered = mouseX >= x && mouseX <= x + width &&
                    mouseY >= y && mouseY <= y + height;

                // We'll store hover state in a transient property or handle it in renderer
                (button as any)._isHovered = isHovered;
                (button as any)._isPressed = isHovered && isMousePressed;

                if (isHovered && isMouseClicked && button.onClick) {
                    this.eventBus.emit(button.onClick, { entity });
                }
            }
        }
    }
}
