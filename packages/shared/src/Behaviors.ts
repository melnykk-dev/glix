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
        id: 'top_down_move',
        name: 'Top-Down Move',
        description: 'Move with WASD or Arrow keys.',
        icon: '🕹️',
        color: '#E94560',
        script: `class TopDownMove extends ScriptComponent {
    speed = 5;
    onUpdate(dt: number) {
        const x = (this.input.isKeyDown('ArrowRight') || this.input.isKeyDown('KeyD') ? 1 : 0) -
                  (this.input.isKeyDown('ArrowLeft') || this.input.isKeyDown('KeyA') ? 1 : 0);
        const y = (this.input.isKeyDown('ArrowUp') || this.input.isKeyDown('KeyW') ? 1 : 0) -
                  (this.input.isKeyDown('ArrowDown') || this.input.isKeyDown('KeyS') ? 1 : 0);
        this.setVelocity(x * this.speed, y * this.speed);
    }
}
export default TopDownMove;`
    },
    {
        id: 'click_to_jump',
        name: 'Click to Jump',
        description: 'Jumps when the mouse is clicked.',
        icon: '🦘',
        color: '#533483',
        script: `class ClickJump extends ScriptComponent {
    power = 10;
    onUpdate() {
        if (this.input.isMousePressed(0)) {
            const v = this.getVelocity();
            this.setVelocity(v.x, this.power);
        }
    }
}
export default ClickJump;`
    },
    {
        id: 'rotate_to_mouse',
        name: 'Face Mouse',
        description: 'Sprites rotates to face the cursor.',
        icon: '👀',
        color: '#0F3460',
        script: `class FaceMouse extends ScriptComponent {
    onUpdate() {
        const mouse = this.input.getMouseWorldPosition();
        const pos = this.getPosition();
        const angle = Math.atan2(mouse.y - pos.y, mouse.x - pos.x);
        this.setRotation(angle);
    }
}
export default FaceMouse;`
    },
    {
        id: 'kill_zone',
        name: 'Kill Zone',
        description: 'Destroys anything it touches.',
        icon: '💀',
        color: '#1D7A5F',
        script: `class KillZone extends ScriptComponent {
    onCollision(other: string) {
        this.world.destroyEntity(other);
    }
}
export default KillZone;`
    },
    {
        id: 'patrol',
        name: 'Patrol',
        description: 'Moves back and forth.',
        icon: '↔️',
        color: '#854F0B',
        script: `class Patrol extends ScriptComponent {
    speed = 2;
    range = 4;
    startX = 0;
    
    onStart() {
        this.startX = this.getPosition().x;
    }

    onUpdate() {
        const pos = this.getPosition();
        if (pos.x > this.startX + this.range) this.speed = -Math.abs(this.speed);
        if (pos.x < this.startX - this.range) this.speed = Math.abs(this.speed);
        this.setVelocity(this.speed, this.getVelocity().y);
    }
}
export default Patrol;`
    },
    {
        id: 'screen_shake',
        name: 'Screen Shake',
        description: 'Shakes the camera on event.',
        icon: '📳',
        color: '#EAB308',
        script: `class ScreenShake extends ScriptComponent {
    intensity = 0.2;
    duration = 0.5;
    onStart() {
        this.engine.getCamera().shake(this.intensity, this.duration);
    }
}
export default ScreenShake;`
    },
    {
        id: 'flash_on_hit',
        name: 'Flash on Hit',
        description: 'Flashes white when damaged.',
        icon: '✨',
        color: '#A855F7',
        script: `class FlashHit extends ScriptComponent {
    onCollision() {
        this.sprite.setEffect('flash', { color: [1,1,1,1], duration: 0.1 });
    }
}
export default FlashHit;`
    }
];
