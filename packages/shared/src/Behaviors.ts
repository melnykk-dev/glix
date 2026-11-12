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
    {
        id: 'player_topdown',
        name: 'Player',
        description: 'Top-down player: move with the move_x / move_y axes (WASD/arrows, touch D-pad, gamepad stick — rebindable in Input settings), E / A button to interact (the "interact" action). Needs: Transform (RigidBody + BoxCollider for physics movement, otherwise moves directly). Emits "playerInteract" for entities tagged "interactable".',
        icon: '🎮',
        color: '#E94560',
        script: `class PlayerTopDown extends ScriptComponent {
  speed = 5;
  interactRange = 1.6;
  interactCooldown = 0.25;
  private interactTimer = 0;
  private warned = new Set<string>();

  onUpdate(dt: number) {
    const t = this.transform;
    if (!t) {
      this.warnOnce('no-transform', 'Player: this entity has no Transform component — add a Transform to move it.');
      return;
    }
    this.interactTimer = Math.max(0, this.interactTimer - dt);

    // Action API (ScriptComponent.axisValue / isActionJustPressed): the
    // move_x / move_y axes and the "interact" action already merge
    // keyboard + touch + gamepad, so this follows the player's rebinds.
    let x = this.axisValue('move_x');
    let y = this.axisValue('move_y');

    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }

    this.applyMove(x * this.speed, y * this.speed, dt);

    if (x !== 0) t.scaleX = x > 0 ? Math.abs(t.scaleX || 1) : -Math.abs(t.scaleX || 1);

    // The cooldown is real: one press must be one interact even when a
    // slow frame runs several fixed steps while the press edge is live.
    if (this.interactTimer <= 0 && this.isActionJustPressed('interact')) {
      this.interactTimer = this.interactCooldown;
      this.interact();
    }
  }

  private applyMove(vx: number, vy: number, dt: number) {
    if (this.hasComponent(this.entity, 'rigidBody')) {
      this.setVelocity(vx, vy);
      return;
    }
    this.warnOnce('no-body', 'Player: no RigidBody on this entity — moving by Transform instead (no physics collisions). Add a RigidBody + BoxCollider for real physics.');
    const t = this.transform;
    if (!t) return;
    t.x += vx * dt;
    t.y += vy * dt;
    this.physics.teleport(this.entity, t.x, t.y);
  }

  private interact() {
    const pos = this.getPosition();
    let best: Entity | undefined;
    let bestD = this.interactRange;
    for (const e of this.findEntitiesWithTag('interactable')) {
      const et = this.getComponent<any>(e, 'transform');
      if (!et) continue;
      const d = Math.hypot(et.x - pos.x, et.y - pos.y);
      if (d <= bestD) { bestD = d; best = e; }
    }
    if (best === undefined) return;
    let targetName = '';
    try { targetName = (this.world as any).getName(best) || ''; } catch (e) { targetName = ''; }
    this.eventBus.emit('playerInteract', { player: this.entity, target: best, targetName });
    this.audio.playSound('interact');
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn('[Glix] ' + message);
  }
}
export default PlayerTopDown;`
    },
    {
        id: 'player_platformer',
        name: 'Player Platformer',
        description: 'Platformer player: run + jump with coyote time and jump buffering. Space / Up / W or touch A button to jump (the "jump" action, rebindable in Input settings). Needs: Transform + RigidBody + BoxCollider.',
        icon: '🏃',
        color: '#f97316',
        script: `class PlayerPlatformer extends ScriptComponent {
  speed = 5;
  jumpForce = 12;
  coyoteTime = 0.12;
  jumpBuffer = 0.1;
  private coyoteTimer = 0;
  private jumpTimer = 0;
  private facingRight = true;
  private warned = new Set<string>();

  onUpdate(dt: number) {
    const t = this.transform;
    if (!t) {
      this.warnOnce('no-transform', 'Player Platformer: this entity has no Transform component — add a Transform to move it.');
      return;
    }
    if (!this.hasComponent(this.entity, 'rigidBody')) {
      this.warnOnce('no-body', 'Player Platformer: no RigidBody on this entity — it can run but cannot jump or fall. Add a RigidBody + BoxCollider.');
    }

    const grounded = this.isGrounded();
    this.coyoteTimer = grounded ? this.coyoteTime : Math.max(0, this.coyoteTimer - dt);

    // Action API: the "jump" action already merges Space / Up / W +
    // touch A + gamepad A, so this follows the player's rebinds.
    if (this.isActionJustPressed('jump')) this.jumpTimer = this.jumpBuffer;
    else this.jumpTimer = Math.max(0, this.jumpTimer - dt);

    // The move_x axis already merges keys + touch D-pad + gamepad stick.
    const moveX = Math.max(-1, Math.min(1, this.axisValue('move_x')));

    if (moveX > 0) this.facingRight = true;
    if (moveX < 0) this.facingRight = false;

    const vel = this.getVelocity();
    if (this.jumpTimer > 0 && this.coyoteTimer > 0 && this.hasComponent(this.entity, 'rigidBody')) {
      this.setVelocity(moveX * this.speed, this.jumpForce);
      this.coyoteTimer = 0;
      this.jumpTimer = 0;
    } else if (this.hasComponent(this.entity, 'rigidBody')) {
      this.setVelocity(moveX * this.speed, vel.y);
    } else {
      t.x += moveX * this.speed * dt;
      this.physics.teleport(this.entity, t.x, t.y);
    }

    t.scaleX = this.facingRight ? Math.abs(t.scaleX || 1) : -Math.abs(t.scaleX || 1);
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn('[Glix] ' + message);
  }
}
export default PlayerPlatformer;`
    },
    {
        id: 'enemy_chase',
        name: 'Enemy Chase',
        description: 'Chases the player when in range, attacks on touch, returns home when the player escapes. Needs: Transform + RigidBody. Player found by name (playerName) or tag "player". Attacks emit a "damage" event — attach the Health behaviour to the player to take damage.',
        icon: '👹',
        color: '#dc2626',
        script: `class EnemyChase extends ScriptComponent {
  playerName = 'Player';
  chaseRange = 6;
  attackRange = 0.9;
  speed = 3.2;
  returnSpeed = 2;
  attackDamage = 1;
  attackCooldown = 1;
  private homeX = 0;
  private homeY = 0;
  private cooldown = 0;
  private warned = new Set<string>();

  onStart() {
    const pos = this.getPosition();
    this.homeX = pos.x;
    this.homeY = pos.y;
  }

  onUpdate(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const t = this.transform;
    if (!t) {
      this.warnOnce('no-transform', 'Enemy Chase: this entity has no Transform component — add a Transform to move it.');
      return;
    }
    const player = this.findPlayer();
    if (player === undefined) {
      this.warnOnce('no-player', 'Enemy Chase: no entity named "' + this.playerName + '" and none tagged "player" — idling until a player exists.');
      this.setVelocity(0, this.getVelocity().y);
      return;
    }
    const pt = this.getComponent<any>(player, 'transform');
    if (!pt) return;
    const pos = this.getPosition();
    const dx = pt.x - pos.x;
    const dy = pt.y - pos.y;
    const d = Math.hypot(dx, dy);

    if (d <= this.attackRange) {
      this.attack(player);
      this.face(dx);
      this.setVelocity(0, this.getVelocity().y);
      return;
    }
    if (d <= this.chaseRange) {
      this.moveToward(pt.x, pt.y, this.speed, dt);
      this.face(dx);
      return;
    }
    const hx = this.homeX - pos.x;
    const hy = this.homeY - pos.y;
    const hd = Math.hypot(hx, hy);
    if (hd > 0.2) {
      this.moveToward(this.homeX, this.homeY, this.returnSpeed, dt);
      this.face(hx);
    } else {
      this.setVelocity(0, this.getVelocity().y);
    }
  }

  onCollision(other: Entity) {
    const player = this.findPlayer();
    if (player !== undefined && other === player) this.attack(player);
  }

  private findPlayer(): Entity | undefined {
    const byName = this.findEntityByName(this.playerName);
    if (byName !== undefined) return byName;
    const tagged = this.findEntitiesWithTag('player');
    return tagged.length > 0 ? tagged[0] : undefined;
  }

  private attack(player: Entity) {
    if (this.cooldown > 0) return;
    this.cooldown = this.attackCooldown;
    this.eventBus.emit('damage', { target: player, amount: this.attackDamage, from: this.entity });
    this.audio.playSound('hit');
  }

  private moveToward(tx: number, ty: number, speed: number, dt: number) {
    const pos = this.getPosition();
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) { this.setVelocity(0, 0); return; }
    const vx = (dx / d) * speed;
    const vy = (dy / d) * speed;
    if (this.hasComponent(this.entity, 'rigidBody')) {
      this.setVelocity(vx, vy);
      return;
    }
    const t = this.transform;
    if (!t) return;
    t.x += vx * dt;
    t.y += vy * dt;
    this.physics.teleport(this.entity, t.x, t.y);
  }

  private face(dx: number) {
    if (dx === 0) return;
    const t = this.transform;
    if (!t) return;
    t.scaleX = dx > 0 ? Math.abs(t.scaleX || 1) : -Math.abs(t.scaleX || 1);
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn('[Glix] ' + message);
  }
}
export default EnemyChase;`
    },
    {
        id: 'enemy_patrol',
        name: 'Enemy Patrol',
        description: 'Walks waypoints in order (loop or ping-pong) and flips its sprite to face movement. Leave waypoints empty for an automatic two-point patrol using patrolRange. Needs: Transform (RigidBody for physics movement, otherwise moves directly).',
        icon: '🚶',
        color: '#b45309',
        script: `class EnemyPatrol extends ScriptComponent {
  speed = 2;
  patrolRange = 4;
  pauseAtEnds = 0.5;
  pingPong = true;
  waypoints: { x: number; y: number }[] = [];
  private points: { x: number; y: number }[] = [];
  private index = 0;
  private dir = 1;
  private pause = 0;
  private warned = new Set<string>();

  onStart() {
    const pos = this.getPosition();
    if (this.waypoints.length > 0) {
      this.points = this.waypoints.map((w) => ({ x: w.x, y: w.y }));
    } else {
      this.points = [
        { x: pos.x - this.patrolRange, y: pos.y },
        { x: pos.x + this.patrolRange, y: pos.y },
      ];
    }
  }

  onUpdate(dt: number) {
    const t = this.transform;
    if (!t) {
      this.warnOnce('no-transform', 'Enemy Patrol: this entity has no Transform component — add a Transform to move it.');
      return;
    }
    if (this.points.length === 0) return;
    if (this.pause > 0) {
      this.pause -= dt;
      this.setVelocity(0, this.getVelocity().y);
      return;
    }
    const target = this.points[this.index];
    const pos = this.getPosition();
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.15) {
      this.advance();
      this.pause = this.pauseAtEnds;
      this.setVelocity(0, this.getVelocity().y);
      return;
    }
    const vx = (dx / d) * this.speed;
    const vy = (dy / d) * this.speed;
    if (this.hasComponent(this.entity, 'rigidBody')) {
      this.setVelocity(vx, vy);
    } else {
      t.x += vx * dt;
      t.y += vy * dt;
      this.physics.teleport(this.entity, t.x, t.y);
    }
    if (dx !== 0) t.scaleX = dx > 0 ? Math.abs(t.scaleX || 1) : -Math.abs(t.scaleX || 1);
  }

  private advance() {
    if (this.points.length <= 1) return;
    if (this.pingPong) {
      this.index += this.dir;
      if (this.index >= this.points.length) {
        this.index = this.points.length - 2;
        this.dir = -1;
      }
      if (this.index < 0) {
        this.index = 1;
        this.dir = 1;
      }
      if (this.index < 0) this.index = 0;
      if (this.index >= this.points.length) this.index = this.points.length - 1;
    } else {
      this.index = (this.index + 1) % this.points.length;
    }
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn('[Glix] ' + message);
  }
}
export default EnemyPatrol;`
    },
    {
        id: 'prey',
        name: 'Prey',
        description: 'Flees from the player or anything tagged "enemy" when close, wanders the rest of the time. Needs: Transform (RigidBody for physics movement, otherwise moves directly). Threat found by name (threatName) or tag (threatTag).',
        icon: '🐇',
        color: '#22c55e',
        script: `class Prey extends ScriptComponent {
  threatName = 'Player';
  threatTag = 'enemy';
  fleeRange = 4;
  fleeSpeed = 4.5;
  wanderSpeed = 1.2;
  wanderChangeTime = 2;
  private wanderX = 1;
  private wanderY = 0;
  private wanderTimer = 0;
  private warned = new Set<string>();

  onUpdate(dt: number) {
    const t = this.transform;
    if (!t) {
      this.warnOnce('no-transform', 'Prey: this entity has no Transform component — add a Transform to move it.');
      return;
    }
    const pos = this.getPosition();
    const threat = this.findNearestThreat();
    if (threat !== undefined) {
      const tp = this.getComponent<any>(threat, 'transform');
      if (tp) {
        const dx = pos.x - tp.x;
        const dy = pos.y - tp.y;
        const d = Math.hypot(dx, dy);
        if (d < this.fleeRange && d > 0.01) {
          this.moveInDirection(dx / d, dy / d, this.fleeSpeed, dt);
          this.face(dx);
          return;
        }
      }
    } else {
      this.warnOnce('no-threat', 'Prey: no entity named "' + this.threatName + '" and none tagged "' + this.threatTag + '" — wandering until a threat appears.');
    }

    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = this.wanderChangeTime;
      const a = Math.random() * Math.PI * 2;
      this.wanderX = Math.cos(a);
      this.wanderY = Math.sin(a);
    }
    this.moveInDirection(this.wanderX, this.wanderY, this.wanderSpeed, dt);
    this.face(this.wanderX);
  }

  private findNearestThreat(): Entity | undefined {
    const pos = this.getPosition();
    let best: Entity | undefined;
    let bestD = Infinity;
    const consider = (e: Entity | undefined) => {
      if (e === undefined) return;
      const tp = this.getComponent<any>(e, 'transform');
      if (!tp) return;
      const d = Math.hypot(tp.x - pos.x, tp.y - pos.y);
      if (d < bestD) { bestD = d; best = e; }
    };
    consider(this.findEntityByName(this.threatName));
    for (const e of this.findEntitiesWithTag(this.threatTag)) consider(e);
    return best;
  }

  private moveInDirection(nx: number, ny: number, speed: number, dt: number) {
    const vx = nx * speed;
    const vy = ny * speed;
    if (this.hasComponent(this.entity, 'rigidBody')) {
      this.setVelocity(vx, vy);
      return;
    }
    const t = this.transform;
    if (!t) return;
    t.x += vx * dt;
    t.y += vy * dt;
    this.physics.teleport(this.entity, t.x, t.y);
  }

  private face(dx: number) {
    if (dx === 0) return;
    const t = this.transform;
    if (!t) return;
    t.scaleX = dx > 0 ? Math.abs(t.scaleX || 1) : -Math.abs(t.scaleX || 1);
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn('[Glix] ' + message);
  }
}
export default Prey;`
    },
    {
        id: 'npc_wander',
        name: 'NPC Wander',
        description: 'Wanders around home, idles between walks, and turns to face the player when near. Interacting emits a "dialogue" event with dialogueLines — hook your dialogue UI to it. Needs: Transform (RigidBody for physics movement, otherwise moves directly). Tag it "interactable" so the Player can talk to it.',
        icon: '🧑‍🌾',
        color: '#0ea5e9',
        script: `class NpcWander extends ScriptComponent {
  wanderRange = 2;
  wanderSpeed = 1;
  idleTime = 2;
  faceRange = 3;
  playerName = 'Player';
  dialogueLines: string[] = ['Hello, traveller!'];
  private homeX = 0;
  private homeY = 0;
  private targetX = 0;
  private targetY = 0;
  private walking = false;
  private timer = 0;
  private warned = new Set<string>();

  onStart() {
    const pos = this.getPosition();
    this.homeX = pos.x;
    this.homeY = pos.y;
    this.targetX = pos.x;
    this.targetY = pos.y;
    this.timer = this.idleTime;
    this.eventBus.on('playerInteract', (data: any) => {
      if (data && data.target === this.entity) this.talk();
    });
  }

  onUpdate(dt: number) {
    const t = this.transform;
    if (!t) {
      this.warnOnce('no-transform', 'NPC Wander: this entity has no Transform component — add a Transform to move it.');
      return;
    }
    const pos = this.getPosition();
    const player = this.findEntityByName(this.playerName);
    let playerNear = false;
    if (player !== undefined) {
      const pt = this.getComponent<any>(player, 'transform');
      if (pt) {
        const dx = pt.x - pos.x;
        const dy = pt.y - pos.y;
        if (Math.hypot(dx, dy) <= this.faceRange && dx !== 0) {
          t.scaleX = dx > 0 ? Math.abs(t.scaleX || 1) : -Math.abs(t.scaleX || 1);
          playerNear = true;
        }
      }
    }

    if (!this.walking) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * this.wanderRange;
        this.targetX = this.homeX + Math.cos(a) * r;
        this.targetY = this.homeY + Math.sin(a) * r;
        this.walking = true;
      }
      this.setVelocity(0, this.getVelocity().y);
      return;
    }

    const dx = this.targetX - pos.x;
    const dy = this.targetY - pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.1) {
      this.walking = false;
      this.timer = this.idleTime;
      this.setVelocity(0, this.getVelocity().y);
      return;
    }
    const vx = (dx / d) * this.wanderSpeed;
    const vy = (dy / d) * this.wanderSpeed;
    if (this.hasComponent(this.entity, 'rigidBody')) {
      this.setVelocity(vx, vy);
    } else {
      t.x += vx * dt;
      t.y += vy * dt;
      this.physics.teleport(this.entity, t.x, t.y);
    }
    if (dx !== 0 && !playerNear) t.scaleX = dx > 0 ? Math.abs(t.scaleX || 1) : -Math.abs(t.scaleX || 1);
  }

  private talk() {
    this.eventBus.emit('dialogue', { npc: this.entity, name: this.name, lines: this.dialogueLines.slice() });
    this.audio.playSound('talk');
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn('[Glix] ' + message);
  }
}
export default NpcWander;`
    },
    {
        id: 'collectible',
        name: 'Collectible',
        description: 'Pickup on touch: adds score, pops, then destroys itself. Works by proximity even without colliders set up. Needs: Transform. Listens for the player by name "Player" or tag "player". Emits "addScore" (the Score Counter listens) and "collect".',
        icon: '⭐',
        color: '#eab308',
        script: `class Collectible extends ScriptComponent {
  scoreValue = 1;
  soundId = 'pickup';
  pickupRange = 0.7;
  private collected = false;

  onUpdate(dt: number) {
    if (this.collected) return;
    const player = this.findPlayer();
    if (player === undefined) return;
    const pp = this.getComponent<any>(player, 'transform');
    if (!pp) return;
    const pos = this.getPosition();
    if (Math.hypot(pp.x - pos.x, pp.y - pos.y) <= this.pickupRange) this.collect(player);
  }

  onCollision(other: Entity) {
    if (this.collected) return;
    const player = this.findPlayer();
    if (player !== undefined && other === player) this.collect(player);
  }

  private findPlayer(): Entity | undefined {
    const byName = this.findEntityByName('Player');
    if (byName !== undefined) return byName;
    const tagged = this.findEntitiesWithTag('player');
    return tagged.length > 0 ? tagged[0] : undefined;
  }

  private collect(player: Entity) {
    if (this.collected) return;
    this.collected = true;
    const pos = this.getPosition();
    this.eventBus.emit('addScore', this.scoreValue);
    this.eventBus.emit('collect', { entity: this.entity, player, value: this.scoreValue, x: pos.x, y: pos.y });
    this.audio.playSound(this.soundId);
    const t = this.transform;
    if (t) {
      t.scaleX = Math.abs(t.scaleX || 1) * 1.4;
      t.scaleY = Math.abs(t.scaleY || 1) * 1.4;
    }
    this.after(0.12, () => this.destroy());
  }
}
export default Collectible;`
    },
    {
        id: 'projectile_shooter',
        name: 'Projectile Shooter',
        description: 'Fires a projectile toward the mouse (or facing direction) on F / Space / click / touch B button (the "fire" action, rebindable in Input settings), with a cooldown. Hits anything tagged "enemy" or "player" and emits a "damage" event. Needs: Transform. Attach to the player or a turret.',
        icon: '🔫',
        color: '#7c3aed',
        script: `class ProjectileShooter extends ScriptComponent {
  projectileSpeed = 10;
  cooldown = 0.4;
  projectileLifetime = 2;
  projectileDamage = 1;
  maxRange = 20;
  aimAtMouse = true;
  private timer = 0;
  private projectiles: { id: Entity; age: number; x0: number; y0: number }[] = [];
  private warned = new Set<string>();

  onUpdate(dt: number) {
    this.timer = Math.max(0, this.timer - dt);
    const t = this.transform;
    if (!t) {
      this.warnOnce('no-transform', 'Projectile Shooter: this entity has no Transform component — add a Transform to aim it.');
      return;
    }
    // Action API: the "fire" action already merges F / Space / mouse /
    // touch B / gamepad button 2, so this follows the player's rebinds.
    // Edge-triggered (isActionJustPressed) + the cooldown below mean one
    // press is one shot even when a slow frame runs several fixed steps.
    if (this.isActionJustPressed('fire') && this.timer <= 0) {
      this.fire();
      this.timer = this.cooldown;
    }

    const keep: { id: Entity; age: number; x0: number; y0: number }[] = [];
    for (const p of this.projectiles) {
      p.age += dt;
      if (!this.world.hasEntity(p.id)) continue;
      const pt = this.getComponent<any>(p.id, 'transform');
      if (!pt) continue;
      const travelled = Math.hypot(pt.x - p.x0, pt.y - p.y0);
      if (p.age >= this.projectileLifetime || travelled >= this.maxRange) {
        this.destroyEntity(p.id);
        continue;
      }
      let hit: Entity | undefined;
      for (const h of this.physics.queryCircle(pt.x, pt.y, 0.35)) {
        if (h !== p.id && h !== this.entity && (this.hasTag(h, 'enemy') || this.hasTag(h, 'player'))) {
          hit = h;
          break;
        }
      }
      if (hit !== undefined) {
        this.eventBus.emit('damage', { target: hit, amount: this.projectileDamage, from: this.entity });
        this.destroyEntity(p.id);
        continue;
      }
      keep.push(p);
    }
    this.projectiles = keep;
  }

  private fire() {
    const pos = this.getPosition();
    const t = this.transform;
    let dx = 1;
    let dy = 0;
    if (t) dx = (t.scaleX || 1) >= 0 ? 1 : -1;
    if (this.aimAtMouse) {
      const m = this.input.getMouseWorldPosition();
      const d = Math.hypot(m.x - pos.x, m.y - pos.y);
      if (d > 0.01) {
        dx = (m.x - pos.x) / d;
        dy = (m.y - pos.y) / d;
      }
    }
    const id = this.spawn('Projectile', {
      transform: { x: pos.x + dx * 0.6, y: pos.y + dy * 0.6, rotation: Math.atan2(dy, dx), scaleX: 1, scaleY: 1 },
      sprite: { textureId: '', tintColor: '#facc15', width: 0.35, height: 0.12, pivotX: 0.5, pivotY: 0.5 },
      rigidBody: { type: 'dynamic', gravityScale: 0, linearDamping: 0, angularDamping: 0, fixedRotation: true },
      boxCollider: { width: 0.35, height: 0.12, offsetX: 0, offsetY: 0, isSensor: true, restitution: 0, friction: 0 },
    });
    this.physics.setVelocity(id, dx * this.projectileSpeed, dy * this.projectileSpeed);
    this.projectiles.push({ id, age: 0, x0: pos.x, y0: pos.y });
    this.audio.playSound('shoot');
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn('[Glix] ' + message);
  }
}
export default ProjectileShooter;`
    },
    {
        id: 'health',
        name: 'Health',
        description: 'Simple HP: takes "damage" events aimed at this entity, brief invulnerability after each hit, emits "healthChanged", dies at 0 HP. Also answers "heal" events. Needs: nothing but the script — attach to any entity. Pair with Enemy Chase or Projectile Shooter, which emit "damage".',
        icon: '❤️',
        color: '#f43f5e',
        script: `class Health extends ScriptComponent {
  maxHealth = 3;
  invulnerabilityTime = 1;
  damageSound = 'hit';
  deathSound = 'death';
  health = 3;
  private invulnerableTimer = 0;
  private dead = false;

  onStart() {
    this.health = this.maxHealth;
    this.eventBus.on('damage', (data: any) => {
      if (!data || data.target !== this.entity) return;
      this.takeDamage(typeof data.amount === 'number' ? data.amount : 1);
    });
    this.eventBus.on('heal', (data: any) => {
      if (!data || data.target !== this.entity) return;
      this.heal(typeof data.amount === 'number' ? data.amount : 1);
    });
  }

  onUpdate(dt: number) {
    if (this.invulnerableTimer > 0) this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
  }

  takeDamage(amount: number) {
    if (this.dead || this.invulnerableTimer > 0 || amount <= 0) return;
    this.health -= amount;
    this.invulnerableTimer = this.invulnerabilityTime;
    this.audio.playSound(this.damageSound);
    this.eventBus.emit('healthChanged', { entity: this.entity, health: Math.max(0, this.health), maxHealth: this.maxHealth });
    if (this.health <= 0) this.die();
  }

  heal(amount: number) {
    if (this.dead || amount <= 0) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.eventBus.emit('healthChanged', { entity: this.entity, health: this.health, maxHealth: this.maxHealth });
  }

  private die() {
    if (this.dead) return;
    this.dead = true;
    this.audio.playSound(this.deathSound);
    this.eventBus.emit('entityDied', { entity: this.entity, name: this.name });
    this.destroy();
  }
}
export default Health;`
    },
];
