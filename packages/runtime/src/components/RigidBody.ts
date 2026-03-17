import { RigidBodyComponent } from '@glix/shared';

export const createRigidBody = (
    type: 'dynamic' | 'static' | 'kinematic' = 'dynamic',
    gravityScale: number = 1,
    linearDamping: number = 0,
    angularDamping: number = 0,
    fixedRotation: boolean = false
): RigidBodyComponent => ({
    type,
    gravityScale,
    linearDamping,
    angularDamping,
    fixedRotation,
});
