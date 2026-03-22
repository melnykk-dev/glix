export interface BehaviorDef {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    script: string;
}

export const BEHAVIORS: BehaviorDef[] = [
    {
        id: 'mario_platformer',
        name: 'Mario Platformer',
        description: 'Full platformer: run, jump, coyote time, sprite flip. Needs RigidBody + BoxCollider.',
        icon: '🍄',
        color: '#ef4444',
        script: `class MarioPlatformer extends ScriptComponent {
  speed = 5;
  jumpForce = 12;
  coyoteTime = 0.12;
  jumpBuffer = 0.1;
  private coyoteTimer = 0;
  private jumpTimer = 0;
  private facingRight = true;

  onUpdate(dt: number) {
    const grounded = this.isGrounded();
    this.coyoteTimer = grounded ? this.coyoteTime : Math.max(0, this.coyoteTimer - dt);

    const jumpPressed =
      this.input.isJustPressed('Space') ||
      this.input.isJustPressed('ArrowUp') ||
      this.input.isJustPressed('KeyW');
    if (jumpPressed) this.jumpTimer = this.jumpBuffer;
    else this.jumpTimer = Math.max(0, this.jumpTimer - dt);

    const moveX =
      (this.input.isKeyDown('ArrowRight') || this.input.isKeyDown('KeyD') ? 1 : 0) -
      (this.input.isKeyDown('ArrowLeft')  || this.input.isKeyDown('KeyA') ? 1 : 0);

    if (moveX > 0) this.facingRight = true;
    if (moveX < 0) this.facingRight = false;

    const vel = this.getVelocity();

    if (this.jumpTimer > 0 && this.coyoteTimer > 0) {
      this.setVelocity(moveX * this.speed, this.jumpForce);
      this.coyoteTimer = 0;
      this.jumpTimer = 0;
    } else {
      this.setVelocity(moveX * this.speed, vel.y);
    }

    const t = this.transform;
    if (t) t.scaleX = this.facingRight ? Math.abs(t.scaleX) : -Math.abs(t.scaleX);
  }
}
export default MarioPlatformer;`
    },
    {
        id: 'flappy_bird',
        name: 'Flappy Bird',
        description: 'Click or press Space to flap. Rotates based on velocity. Reload scene on collision.',
        icon: '🐦',
        color: '#f59e0b',
        script: `class FlappyBird extends ScriptComponent {
  flapForce = 7;
  private dead = false;
  private started = false;

  onUpdate(dt: number) {
    const flap = this.input.isJustPressed('Space') || this.input.isMousePressed(0);

    if (!this.started && flap) {
      this.started = true;
    }

    if (this.dead || !this.started) {
      this.setVelocity(0, 0);
      return;
    }

    if (flap) {
      this.setVelocity(this.getVelocity().x, this.flapForce);
      this.audio.playSound('flap');
    }

    const vel = this.getVelocity();
    const angle = Math.max(-0.5, Math.min(0.8, -vel.y * 0.06));
    this.setRotation(angle);

    const pos = this.getPosition();
    if (pos.y < -12 || pos.y > 12) this.die();
  }

  onCollision(_other: Entity) {
    this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.setVelocity(0, 0);
    this.audio.playSound('hit');
    this.after(1.5, () => this.reloadScene());
  }
}
export default FlappyBird;`
    },
    {
        id: 'pipe_spawner',
        name: 'Pipe Spawner',
        description: 'Spawns obstacle pipe pairs. Put on an empty entity. Works with Flappy Bird.',
        icon: '🌵',
        color: '#22c55e',
        script: `class PipeSpawner extends ScriptComponent {
  interval = 2.2;
  gapSize = 3.5;
  pipeW = 1.1;
  pipeH = 12;
  moveSpeed = 3.5;
  startDelay = 2;
  private timer = 0;
  private pipes: Entity[] = [];
  private active = false;

  onStart() {
    this.timer = -this.startDelay;
  }

  onUpdate(dt: number) {
    this.timer += dt;
    if (!this.active && this.timer >= 0) this.active = true;
    if (!this.active) return;

    if (this.timer >= this.interval) {
      this.timer = 0;
      this.spawnPair();
    }

    const toRemove: Entity[] = [];
    for (const p of this.pipes) {
      const t = this.getComponent<any>(p, 'transform');
      if (!t || !this.world.hasEntity(p)) { toRemove.push(p); continue; }
      if (t.x < -20) { this.destroyEntity(p); toRemove.push(p); continue; }
      t.x -= this.moveSpeed * dt;
      this.physics.teleport(p, t.x, t.y);
    }
    this.pipes = this.pipes.filter(p => !toRemove.includes(p));
  }

  spawnPair() {
    const gapY = (Math.random() - 0.5) * 6;
    const halfGap = this.gapSize / 2;
    const x = 14;

    const btm = this.spawn('Pipe', {
      transform: { x, y: gapY - halfGap - this.pipeH / 2, rotation: 0, scaleX: 1, scaleY: 1 },
      sprite: { textureId: '', tintColor: '#16a34a', width: this.pipeW, height: this.pipeH, pivotX: 0.5, pivotY: 0.5 },
      rigidBody: { type: 'static', gravityScale: 0, linearDamping: 0, angularDamping: 0, fixedRotation: true },
      boxCollider: { width: this.pipeW, height: this.pipeH, offsetX: 0, offsetY: 0, isSensor: false, restitution: 0, friction: 0 },
    });
    const top = this.spawn('Pipe', {
      transform: { x, y: gapY + halfGap + this.pipeH / 2, rotation: 0, scaleX: 1, scaleY: 1 },
      sprite: { textureId: '', tintColor: '#16a34a', width: this.pipeW, height: this.pipeH, pivotX: 0.5, pivotY: 0.5 },
      rigidBody: { type: 'static', gravityScale: 0, linearDamping: 0, angularDamping: 0, fixedRotation: true },
      boxCollider: { width: this.pipeW, height: this.pipeH, offsetX: 0, offsetY: 0, isSensor: false, restitution: 0, friction: 0 },
    });
    this.pipes.push(btm, top);
  }
}
export default PipeSpawner;`
    },
    {
        id: 'camera_follow',
        name: 'Camera Follow',
        description: 'Smoothly follows a named entity. Set targetName to the entity\'s name.',
        icon: '🎥',
        color: '#8b5cf6',
        script: `class CameraFollow extends ScriptComponent {
  targetName = 'Player';
  smooth = 5;
  offsetX = 0;
  offsetY = 1;
  clampX = false;
  minX = -50;
  maxX = 50;

  onUpdate(dt: number) {
    const target = this.findEntityByName(this.targetName);
    if (!target) return;
    const t = this.getComponent<any>(target, 'transform');
    if (!t) return;

    const cam = this.getCameraPosition();
    const alpha = Math.min(this.smooth * dt, 1);
    let nx = cam.x + (t.x + this.offsetX - cam.x) * alpha;
    let ny = cam.y + (t.y + this.offsetY - cam.y) * alpha;

    if (this.clampX) {
      nx = Math.max(this.minX, Math.min(this.maxX, nx));
    }

    this.setCameraPosition(nx, ny);
  }
}
export default CameraFollow;`
    },
    {
        id: 'top_down_move',
        name: 'Top-Down Move',
        description: 'Move in all directions with WASD or Arrow keys.',
        icon: '🕹️',
        color: '#E94560',
        script: `class TopDownMove extends ScriptComponent {
  speed = 5;
  onUpdate(dt: number) {
    const x =
      (this.input.isKeyDown('ArrowRight') || this.input.isKeyDown('KeyD') ? 1 : 0) -
      (this.input.isKeyDown('ArrowLeft')  || this.input.isKeyDown('KeyA') ? 1 : 0);
    const y =
      (this.input.isKeyDown('ArrowUp')   || this.input.isKeyDown('KeyW') ? 1 : 0) -
      (this.input.isKeyDown('ArrowDown') || this.input.isKeyDown('KeyS') ? 1 : 0);
    this.setVelocity(x * this.speed, y * this.speed);
  }
}
export default TopDownMove;`
    },
    {
        id: 'click_to_jump',
        name: 'Click / Space Jump',
        description: 'Jumps when Space or mouse is pressed. Add RigidBody + BoxCollider.',
        icon: '🦘',
        color: '#533483',
        script: `class ClickJump extends ScriptComponent {
  power = 10;
  onUpdate(dt: number) {
    if ((this.input.isJustPressed('Space') || this.input.isMousePressed(0)) && this.isGrounded()) {
      this.setVelocity(this.getVelocity().x, this.power);
    }
  }
}
export default ClickJump;`
    },
    {
        id: 'platform_generator',
        name: 'Platform Generator',
        description: 'Generates scrolling platforms. Attach to an empty entity for infinite runner.',
        icon: '🏗️',
        color: '#0ea5e9',
        script: `class PlatformGenerator extends ScriptComponent {
  speed = 4;
  spawnX = 16;
  despawnX = -16;
  interval = 2.5;
  private timer = 0;
  private platforms: Entity[] = [];

  onUpdate(dt: number) {
    this.timer += dt;
    if (this.timer >= this.interval) {
      this.timer = 0;
      this.spawnPlatform();
    }

    const toRemove: Entity[] = [];
    for (const p of this.platforms) {
      const t = this.getComponent<any>(p, 'transform');
      if (!t || !this.world.hasEntity(p)) { toRemove.push(p); continue; }
      if (t.x < this.despawnX) { this.destroyEntity(p); toRemove.push(p); continue; }
      t.x -= this.speed * dt;
      this.physics.teleport(p, t.x, t.y);
    }
    this.platforms = this.platforms.filter(p => !toRemove.includes(p));
  }

  spawnPlatform() {
    const w = 2 + Math.random() * 3;
    const y = -3 + (Math.random() - 0.5) * 4;
    const p = this.spawn('Platform', {
      transform: { x: this.spawnX, y, rotation: 0, scaleX: 1, scaleY: 1 },
      sprite: { textureId: '', tintColor: '#92400e', width: w, height: 0.4, pivotX: 0.5, pivotY: 0.5 },
      rigidBody: { type: 'static', gravityScale: 0, linearDamping: 0, angularDamping: 0, fixedRotation: true },
      boxCollider: { width: w, height: 0.4, offsetX: 0, offsetY: 0, isSensor: false, restitution: 0, friction: 0.5 },
    });
    this.platforms.push(p);
  }
}
export default PlatformGenerator;`
    },
    {
        id: 'kill_on_collision',
        name: 'Death Zone',
        description: 'Reloads the current scene when touched.',
        icon: '💀',
        color: '#dc2626',
        script: `class DeathZone extends ScriptComponent {
  delay = 0.5;
  private triggered = false;
  onCollision(other: Entity) {
    if (this.triggered) return;
    this.triggered = true;
    this.audio.playSound('death');
    this.after(this.delay, () => this.reloadScene());
  }
}
export default DeathZone;`
    },
    {
        id: 'score_counter',
        name: 'Score Counter',
        description: 'Keeps score. Listens for "addScore" events. Set labelName to a UI Label entity.',
        icon: '🏆',
        color: '#eab308',
        script: `class ScoreCounter extends ScriptComponent {
  labelName = 'ScoreLabel';
  score = 0;
  private label: Entity | undefined;

  onStart() {
    this.label = this.findEntityByName(this.labelName);
    this.updateLabel();
    this.eventBus.on('addScore', (amount: number) => {
      this.score += amount;
      this.updateLabel();
    });
  }

  updateLabel() {
    if (!this.label) this.label = this.findEntityByName(this.labelName);
    if (!this.label) return;
    const lbl = this.getComponent<any>(this.label, 'uiLabel');
    if (lbl) lbl.text = 'Score: ' + this.score;
  }
}
export default ScoreCounter;`
    },
    {
        id: 'rotate_to_mouse',
        name: 'Face Mouse',
        description: 'Entity rotates to face the cursor.',
        icon: '👀',
        color: '#0F3460',
        script: `class FaceMouse extends ScriptComponent {
  onUpdate(dt: number) {
    const mouse = this.input.getMouseWorldPosition();
    const pos = this.getPosition();
    this.setRotation(Math.atan2(mouse.y - pos.y, mouse.x - pos.x));
  }
}
export default FaceMouse;`
    },
    {
        id: 'patrol',
        name: 'Patrol',
        description: 'Moves back and forth between two points.',
        icon: '↔️',
        color: '#854F0B',
        script: `class Patrol extends ScriptComponent {
  speed = 2;
  range = 4;
  private startX = 0;
  private dir = 1;

  onStart() { this.startX = this.getPosition().x; }

  onUpdate(dt: number) {
    const pos = this.getPosition();
    if (pos.x > this.startX + this.range) this.dir = -1;
    if (pos.x < this.startX - this.range) this.dir = 1;
    this.setVelocity(this.speed * this.dir, this.getVelocity().y);
    const t = this.transform;
    if (t) t.scaleX = this.dir > 0 ? Math.abs(t.scaleX) : -Math.abs(t.scaleX);
  }
}
export default Patrol;`
    },
    {
        id: 'auto_destroy',
        name: 'Auto Destroy',
        description: 'Destroys itself after a set time (seconds).',
        icon: '⏱️',
        color: '#6b7280',
        script: `class AutoDestroy extends ScriptComponent {
  lifetime = 3;
  private elapsed = 0;

  onUpdate(dt: number) {
    this.elapsed += dt;
    if (this.elapsed >= this.lifetime) this.destroy();
  }
}
export default AutoDestroy;`
    },
    {
        id: 'move_horizontal',
        name: 'Move Horizontal',
        description: 'Moves entity left or right at a constant speed. Useful for scrolling obstacles.',
        icon: '➡️',
        color: '#14b8a6',
        script: `class MoveHorizontal extends ScriptComponent {
  speed = -3;

  onUpdate(dt: number) {
    const t = this.transform;
    if (!t) return;
    t.x += this.speed * dt;
    this.physics.teleport(this.entity, t.x, t.y);
  }
}
export default MoveHorizontal;`
    },
    {
        id: 'gravity_flip',
        name: 'Gravity Flip',
        description: 'Flips gravity on Space/click. Good for infinite runner variants.',
        icon: '🔄',
        color: '#7c3aed',
        script: `class GravityFlip extends ScriptComponent {
  gravityStrength = 9.81;
  private flipped = false;

  onUpdate(dt: number) {
    if (this.input.isJustPressed('Space') || this.input.isMousePressed(0)) {
      this.flipped = !this.flipped;
      this.physics.setGravity(0, this.flipped ? this.gravityStrength : -this.gravityStrength);
      this.setVelocity(this.getVelocity().x, 0);
    }
  }
}
export default GravityFlip;`
    },
    {
        id: 'screen_wrap',
        name: 'Screen Wrap',
        description: 'Wraps entity to the opposite side of the screen when it goes off-edge.',
        icon: '🌐',
        color: '#0284c7',
        script: `class ScreenWrap extends ScriptComponent {
  boundsX = 14;
  boundsY = 9;

  onUpdate(dt: number) {
    const pos = this.getPosition();
    let nx = pos.x, ny = pos.y;
    if (pos.x > this.boundsX)  nx = -this.boundsX;
    if (pos.x < -this.boundsX) nx = this.boundsX;
    if (pos.y > this.boundsY)  ny = -this.boundsY;
    if (pos.y < -this.boundsY) ny = this.boundsY;
    if (nx !== pos.x || ny !== pos.y) this.setPosition(nx, ny);
  }
}
export default ScreenWrap;`
    },
];
