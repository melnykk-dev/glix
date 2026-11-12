import { World } from '../core/World';
import { InputManager } from '../input/InputManager';
import { EventBus } from '../core/EventBus';
import type { UITextboxComponent, UIScrollViewComponent } from '@glix/shared';

/**
 * Printable keys for uiTextbox, as [unshifted, shifted] pairs by e.code.
 * US layout. Shift is read live (either Shift key held). Keys not listed
 * here never reach a textbox — arrows/Backspace/Enter/Escape are handled
 * separately below.
 */
const PRINTABLE_KEYS: Record<string, [string, string]> = {
    Space: [' ', ' '],
    Digit0: ['0', ')'], Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'],
    Digit4: ['4', '$'], Digit5: ['5', '%'], Digit6: ['6', '^'], Digit7: ['7', '&'],
    Digit8: ['8', '*'], Digit9: ['9', '('],
    KeyA: ['a', 'A'], KeyB: ['b', 'B'], KeyC: ['c', 'C'], KeyD: ['d', 'D'],
    KeyE: ['e', 'E'], KeyF: ['f', 'F'], KeyG: ['g', 'G'], KeyH: ['h', 'H'],
    KeyI: ['i', 'I'], KeyJ: ['j', 'J'], KeyK: ['k', 'K'], KeyL: ['l', 'L'],
    KeyM: ['m', 'M'], KeyN: ['n', 'N'], KeyO: ['o', 'O'], KeyP: ['p', 'P'],
    KeyQ: ['q', 'Q'], KeyR: ['r', 'R'], KeyS: ['s', 'S'], KeyT: ['t', 'T'],
    KeyU: ['u', 'U'], KeyV: ['v', 'V'], KeyW: ['w', 'W'], KeyX: ['x', 'X'],
    KeyY: ['y', 'Y'], KeyZ: ['z', 'Z'],
    Minus: ['-', '_'], Equal: ['=', '+'],
    BracketLeft: ['[', '{'], BracketRight: [']', '}'],
    Semicolon: [';', ':'], Quote: ["'", '"'],
    Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'],
    Backquote: ['`', '~'], Backslash: ['\\', '|'],
    Numpad0: ['0', '0'], Numpad1: ['1', '1'], Numpad2: ['2', '2'],
    Numpad3: ['3', '3'], Numpad4: ['4', '4'], Numpad5: ['5', '5'],
    Numpad6: ['6', '6'], Numpad7: ['7', '7'], Numpad8: ['8', '8'],
    Numpad9: ['9', '9'], NumpadAdd: ['+', '+'], NumpadSubtract: ['-', '-'],
    NumpadMultiply: ['*', '*'], NumpadDivide: ['/', '/'], NumpadDecimal: ['.', '.'],
};

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
        const shiftHeld = inputManager.isKeyDown('ShiftLeft') || inputManager.isKeyDown('ShiftRight');

        // A click inside any textbox focuses it; a click anywhere else blurs.
        let clickedTextbox: string | null = null;

        // Sort by sortingLayer if needed, but for now just process all
        for (const entity of uiEntities) {
            const transform = world.getComponent(entity, 'uiTransform')!;
            const button = world.getComponent(entity, 'uiButton');
            const slider = world.getComponent(entity, 'uiSlider');
            const checkbox = world.getComponent(entity, 'uiCheckbox');
            const textbox = world.getComponent(entity, 'uiTextbox');
            const scrollView = world.getComponent(entity, 'uiScrollView');

            // Calculate screen bounds based on generic size from panel/button/image
            let width = 0;
            let height = 0;

            const panel = world.getComponent(entity, 'uiPanel');
            const image = world.getComponent(entity, 'uiImage');
            const progress = world.getComponent(entity, 'uiProgressBar');

            if (panel) { width = panel.width; height = panel.height; }
            else if (image) { width = image.width; height = image.height; }
            else if (progress) { width = progress.width; height = progress.height; }
            else if (slider) { width = slider.width; height = slider.height; }
            else if (checkbox) { width = checkbox.size; height = checkbox.size; }
            else if (textbox) { width = textbox.width; height = textbox.height; }
            else if (scrollView) { width = scrollView.width; height = scrollView.height; }
            else if (button) {
                width = 100; height = 40; // Fallback
            }

            // Children of a scroll view are positioned relative to the
            // container's top-left (anchor 0,0 + offset) and move with it.
            const parentId = transform.scrollParent;
            let parentOffsetY = 0;
            let parentRect: { x: number; y: number; width: number; height: number } | null = null;
            if (parentId) {
                const parentScroll = world.getComponent(parentId, 'uiScrollView');
                const parentTransform = world.getComponent(parentId, 'uiTransform');
                if (parentScroll && parentTransform) {
                    const px = (parentTransform.anchorX * canvasWidth) + parentTransform.offsetX - (parentTransform.pivotX * parentScroll.width);
                    const py = (parentTransform.anchorY * canvasHeight) + parentTransform.offsetY - (parentTransform.pivotY * parentScroll.height);
                    parentRect = { x: px, y: py, width: parentScroll.width, height: parentScroll.height };
                    parentOffsetY = -parentScroll.scrollOffset;
                }
            }

            // Calculate position
            const x = (transform.anchorX * canvasWidth) + transform.offsetX - (transform.pivotX * width) + (parentRect ? parentRect.x : 0);
            const y = (transform.anchorY * canvasHeight) + transform.offsetY - (transform.pivotY * height) + (parentRect ? parentRect.y : 0) + parentOffsetY;

            // Hit test (shared by button / slider / checkbox below)
            const isHovered = mouseX >= x && mouseX <= x + width &&
                mouseY >= y && mouseY <= y + height;

            if (button) {
                // Hit test
                // We'll store hover state in a transient property or handle it in renderer
                (button as any)._isHovered = isHovered;
                (button as any)._isPressed = isHovered && isMousePressed;

                if (isHovered && isMouseClicked && button.onClick) {
                    this.eventBus.emit(button.onClick, { entity });
                }
            }

            if (slider) {
                // Drag: grab on click inside, keep updating while held (clamped).
                if (isHovered && isMouseClicked) {
                    (slider as any)._dragging = true;
                }
                if ((slider as any)._dragging) {
                    if (!isMousePressed) {
                        (slider as any)._dragging = false;
                    } else {
                        const frac = width > 0 ? Math.max(0, Math.min(1, (mouseX - x) / width)) : 0;
                        const next = slider.min + frac * (slider.max - slider.min);
                        if (Math.abs(next - slider.value) > 1e-6) {
                            slider.value = next;
                            if (slider.onChange) {
                                this.eventBus.emit(slider.onChange, { entity, value: slider.value });
                            }
                        }
                    }
                }
            }

            if (checkbox) {
                if (isHovered && isMouseClicked) {
                    checkbox.checked = !checkbox.checked;
                    if (checkbox.onToggle) {
                        this.eventBus.emit(checkbox.onToggle, { entity, checked: checkbox.checked });
                    }
                }
            }

            if (textbox) {
                if (isHovered && isMouseClicked) {
                    clickedTextbox = entity;
                }
                if (textbox.focused) {
                    this.handleTextboxKeys(textbox, inputManager, shiftHeld, entity);
                }
            }

            if (scrollView) {
                this.handleScrollView(world, entity, scrollView, x, y, width, height, isHovered, isMouseClicked, isMousePressed, mouseY, inputManager);
            }
        }

        // Focus bookkeeping, after the loop so a click on a second textbox
        // moves focus instead of blurring everything.
        if (isMouseClicked) {
            for (const entity of uiEntities) {
                const textbox = world.getComponent(entity, 'uiTextbox');
                if (!textbox) continue;
                if (entity === clickedTextbox) {
                    if (!textbox.focused) {
                        textbox.focused = true;
                        textbox.cursor = textbox.text.length;
                    }
                } else if (textbox.focused) {
                    textbox.focused = false;
                }
            }
            // A click that focused a textbox this frame must not also type
            // into it from the same click — keys are handled above, before
            // focus changes, so nothing to do here.
        }

        // Nobody scrolled: drain the wheel delta so one notch does not sit
        // around and scroll a view the mouse hovers later.
        inputManager.consumeWheelDeltaY();
    }

    private handleTextboxKeys(
        textbox: UITextboxComponent,
        inputManager: InputManager,
        shiftHeld: boolean,
        entity: string,
    ): void {
        // Keys are CONSUMED, not just read: update() runs once per fixed
        // step, and several steps can run in one frame — without consume,
        // one keystroke would insert the same character up to 5 times.
        const emitChange = () => {
            if (textbox.onChange) {
                this.eventBus.emit(textbox.onChange, { entity, text: textbox.text });
            }
        };

        for (const code of Object.keys(PRINTABLE_KEYS)) {
            if (!inputManager.consumeJustPressed(code)) continue;
            if (textbox.text.length >= textbox.maxLength) continue;
            const [lower, upper] = PRINTABLE_KEYS[code];
            const ch = shiftHeld ? upper : lower;
            const at = Math.max(0, Math.min(textbox.cursor, textbox.text.length));
            textbox.text = textbox.text.slice(0, at) + ch + textbox.text.slice(at);
            textbox.cursor = at + 1;
            emitChange();
        }

        if (inputManager.consumeJustPressed('Backspace')) {
            const at = Math.max(0, Math.min(textbox.cursor, textbox.text.length));
            if (at > 0) {
                textbox.text = textbox.text.slice(0, at - 1) + textbox.text.slice(at);
                textbox.cursor = at - 1;
                emitChange();
            }
        }
        if (inputManager.consumeJustPressed('Delete')) {
            const at = Math.max(0, Math.min(textbox.cursor, textbox.text.length));
            if (at < textbox.text.length) {
                textbox.text = textbox.text.slice(0, at) + textbox.text.slice(at + 1);
                emitChange();
            }
        }
        if (inputManager.consumeJustPressed('ArrowLeft')) {
            textbox.cursor = Math.max(0, textbox.cursor - 1);
        }
        if (inputManager.consumeJustPressed('ArrowRight')) {
            textbox.cursor = Math.min(textbox.text.length, textbox.cursor + 1);
        }
        if (inputManager.consumeJustPressed('Enter')) {
            if (textbox.onSubmit) {
                this.eventBus.emit(textbox.onSubmit, { entity, text: textbox.text });
            }
        }
        if (inputManager.consumeJustPressed('Escape')) {
            textbox.focused = false;
        }
    }

    private handleScrollView(
        world: World,
        entity: string,
        scrollView: UIScrollViewComponent,
        x: number,
        y: number,
        width: number,
        height: number,
        isHovered: boolean,
        isMouseClicked: boolean,
        isMousePressed: boolean,
        mouseY: number,
        inputManager: InputManager,
    ): void {
        // Content height from children (anchor 0,0 + offset): the lowest
        // child bottom wins. A manually set contentHeight overrides it.
        let contentHeight = scrollView.contentHeight;
        if (!(contentHeight > 0)) {
            contentHeight = 0;
            for (const child of world.getEntitiesWithComponents('uiTransform')) {
                const childT = world.getComponent(child, 'uiTransform')!;
                if (childT.scrollParent !== entity) continue;
                const childH = this.uiChildHeight(world, child);
                contentHeight = Math.max(contentHeight, childT.offsetY + childH);
            }
        }
        const maxScroll = Math.max(0, contentHeight - height);
        // The renderer reads this to size the scrollbar thumb.
        (scrollView as any)._contentHeight = contentHeight;
        const clamp = (v: number) => Math.max(0, Math.min(maxScroll, v));

        // Wheel over the container scrolls it (consumed: one notch = once).
        if (isHovered) {
            const dy = inputManager.consumeWheelDeltaY();
            if (dy !== 0) {
                const next = clamp(scrollView.scrollOffset + dy);
                if (next !== scrollView.scrollOffset) {
                    scrollView.scrollOffset = next;
                    if (scrollView.onScroll) {
                        this.eventBus.emit(scrollView.onScroll, { entity, scrollOffset: next });
                    }
                }
            }
        }

        // Scrollbar thumb drag (right edge, 10px wide).
        if (scrollView.showScrollbar && maxScroll > 0) {
            const trackX = x + width - 10;
            const trackY = y;
            const trackH = height;
            const thumbH = Math.max(20, (height / contentHeight) * trackH);
            const thumbY = trackY + (scrollView.scrollOffset / maxScroll) * (trackH - thumbH);
            const onThumb = mouseY >= thumbY && mouseY <= thumbY + thumbH &&
                inputManager.getMousePosition().x >= trackX && inputManager.getMousePosition().x <= trackX + 10;
            if (onThumb && isMouseClicked) {
                (scrollView as any)._dragging = true;
                (scrollView as any)._grabOffset = mouseY - thumbY;
            }
            if ((scrollView as any)._dragging) {
                if (!isMousePressed) {
                    (scrollView as any)._dragging = false;
                } else {
                    const grab = (scrollView as any)._grabOffset ?? 0;
                    const frac = (mouseY - grab - trackY) / Math.max(1, trackH - thumbH);
                    const next = clamp(Math.max(0, Math.min(1, frac)) * maxScroll);
                    if (next !== scrollView.scrollOffset) {
                        scrollView.scrollOffset = next;
                        if (scrollView.onScroll) {
                            this.eventBus.emit(scrollView.onScroll, { entity, scrollOffset: next });
                        }
                    }
                }
            }
        }
    }

    /** Approximate height of a scroll child, for content-height math. */
    private uiChildHeight(world: World, entity: string): number {
        const panel = world.getComponent(entity, 'uiPanel');
        if (panel) return panel.height;
        const image = world.getComponent(entity, 'uiImage');
        if (image) return image.height;
        const progress = world.getComponent(entity, 'uiProgressBar');
        if (progress) return progress.height;
        const slider = world.getComponent(entity, 'uiSlider');
        if (slider) return slider.height;
        const checkbox = world.getComponent(entity, 'uiCheckbox');
        if (checkbox) return checkbox.size;
        const textbox = world.getComponent(entity, 'uiTextbox');
        if (textbox) return textbox.height;
        const scrollView = world.getComponent(entity, 'uiScrollView');
        if (scrollView) return scrollView.height;
        const label = world.getComponent(entity, 'uiLabel');
        if (label) return label.fontSize;
        return 40;
    }
}
