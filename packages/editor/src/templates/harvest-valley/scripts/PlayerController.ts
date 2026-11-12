// Harvest Valley — PlayerController
// Type-only import so the editor's tsc can resolve the base class: at
// runtime ScriptComponent is a sandbox global provided by ScriptSandbox,
// never imported. `import type` + `declare const` are both erased by
// esbuild, so the compiled script has no require() and the sandbox stays
// intact. All this.* members below are the real ScriptComponent API.
import type { ScriptComponent as _ScriptComponent } from '@glix/runtime';
declare const ScriptComponent: typeof _ScriptComponent;
// Top-down movement (WASD / arrows / touch D-pad via pad: sources) + input
// dispatch. All game logic lives in GameManager; this script only moves the
// player and forwards button presses on the event bus:
//   hv:interact  — E / Space / pad:a (context action: till, plant, water,
//                  harvest, talk, shop, fish, sleep)
//   hv:key       — { code } for Digit1..Digit4 and KeyQ
//   hv:cancel    — Escape / pad:b (close shop / dialogue / fishing)
class PlayerController extends ScriptComponent {
  speed = 5;
  private frozen = false;

  onStart(): void {
    this.eventBus.on('hv:freeze', (data: any) => {
      this.frozen = !!data.frozen;
    });
  }

  onUpdate(_dt: number): void {
    const input = this.input as any;

    // While frozen (shop / fishing open) the player cannot move, but key
    // presses must still reach the GameManager — the shop keys, the fishing
    // catch key and Escape all flow through this script. So freezing stops
    // movement only; the event forwarding below always runs.
    if (this.frozen) {
      this.setVelocity(0, 0);
    } else {
      const left =
        this.input.isKeyDown('ArrowLeft') ||
        this.input.isKeyDown('KeyA') ||
        (typeof input.isTouchSourceDown === 'function' && input.isTouchSourceDown('pad:left'));
      const right =
        this.input.isKeyDown('ArrowRight') ||
        this.input.isKeyDown('KeyD') ||
        (typeof input.isTouchSourceDown === 'function' && input.isTouchSourceDown('pad:right'));
      const up =
        this.input.isKeyDown('ArrowUp') ||
        this.input.isKeyDown('KeyW') ||
        (typeof input.isTouchSourceDown === 'function' && input.isTouchSourceDown('pad:up'));
      const down =
        this.input.isKeyDown('ArrowDown') ||
        this.input.isKeyDown('KeyS') ||
        (typeof input.isTouchSourceDown === 'function' && input.isTouchSourceDown('pad:down'));

      let moveX = (right ? 1 : 0) - (left ? 1 : 0);
      let moveY = (up ? 1 : 0) - (down ? 1 : 0);

      // Gamepad left stick, when a physical gamepad is connected.
      try {
        if (typeof input.getGamepadAxis === 'function') {
          const gx = input.getGamepadAxis(0, 0, 0.25);
          const gy = input.getGamepadAxis(0, 1, 0.25);
          if (gx !== 0 || gy !== 0) {
            moveX = gx;
            moveY = -gy;
          }
        }
      } catch (e) {
        // No gamepad support in this build; keyboard/touch still work.
      }

      const len = Math.sqrt(moveX * moveX + moveY * moveY) || 1;
      this.setVelocity((moveX / len) * this.speed, (moveY / len) * this.speed);

      if (moveX !== 0 || moveY !== 0) {
        this.setRotation(Math.atan2(moveY, moveX) - Math.PI / 2);
      }
    }

    const pressed =
      this.input.isJustPressed('KeyE') ||
      this.input.isJustPressed('Space') ||
      (typeof input.isTouchSourceJustPressed === 'function' &&
        input.isTouchSourceJustPressed('pad:a'));
    if (pressed) {
      const pos = this.getPosition();
      this.eventBus.emit('hv:interact', { x: pos.x, y: pos.y });
    }

    const toolKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
    for (const code of toolKeys) {
      if (this.input.isJustPressed(code)) {
        this.eventBus.emit('hv:key', { code });
      }
    }
    if (this.input.isJustPressed('KeyQ')) {
      this.eventBus.emit('hv:key', { code: 'KeyQ' });
    }

    const cancel =
      this.input.isJustPressed('Escape') ||
      (typeof input.isTouchSourceJustPressed === 'function' &&
        input.isTouchSourceJustPressed('pad:b'));
    if (cancel) {
      this.eventBus.emit('hv:cancel', {});
    }
  }
}

export default PlayerController;
