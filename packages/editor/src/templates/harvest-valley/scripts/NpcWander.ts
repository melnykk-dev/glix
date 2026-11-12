// Harvest Valley — NpcWander
// Type-only import so the editor's tsc can resolve the base class: at
// runtime ScriptComponent is a sandbox global provided by ScriptSandbox,
// never imported. `import type` + `declare const` are both erased by
// esbuild, so the compiled script has no require() and the sandbox stays
// intact. All this.* members below are the real ScriptComponent API.
import type { ScriptComponent as _ScriptComponent } from '@glix/runtime';
declare const ScriptComponent: typeof _ScriptComponent;
// Generic wander behaviour. Waypoints are picked by entity name so one
// script serves both the villager (Mira) and the yard chicken:
//   Mira    — wanders the village green south of the house
//   Chicken — wanders the west yard by the pond
// Walk to a waypoint, idle 2-4s, pick another. Faces the direction of travel.
class NpcWander extends ScriptComponent {
  speed = 1.6;
  private waypoints: Array<{ x: number; y: number }> = [];
  private target = 0;
  private idleTimer = 0;
  private started = false;

  onStart(): void {
    if (this.name === 'Mira') {
      this.speed = 1.6;
      this.waypoints = [
        { x: 0.5, y: -2.5 },
        { x: 3.5, y: -3.5 },
        { x: 1.5, y: -4.5 },
        { x: -1.5, y: -3.5 },
        { x: 5.5, y: -1.5 },
      ];
    } else {
      // Chicken (or any other wanderer): west yard by the pond.
      this.speed = 1.2;
      this.waypoints = [
        { x: -6.5, y: -1.5 },
        { x: -6.5, y: -5.0 },
        { x: -3.5, y: -5.5 },
        { x: -1.5, y: -5.0 },
      ];
    }
    this.target = 0;
    this.idleTimer = 1;
    this.started = true;
  }

  onUpdate(dt: number): void {
    if (!this.started || this.waypoints.length === 0) return;

    if (this.idleTimer > 0) {
      this.idleTimer -= dt;
      this.setVelocity(0, 0);
      return;
    }

    const pos = this.getPosition();
    const wp = this.waypoints[this.target];
    const dx = wp.x - pos.x;
    const dy = wp.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.25) {
      this.setVelocity(0, 0);
      this.idleTimer = 2 + Math.random() * 2;
      this.target = Math.floor(Math.random() * this.waypoints.length);
      return;
    }

    this.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
    this.setRotation(Math.atan2(dy, dx) - Math.PI / 2);
  }
}

export default NpcWander;
