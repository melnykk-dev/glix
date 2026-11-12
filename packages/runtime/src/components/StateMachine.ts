import { StateMachineComponent } from '@glix/shared';

export const createStateMachine = (
    states: Record<string, string> = {},
    currentState: string = ''
): StateMachineComponent => ({
    states,
    currentState,
});
