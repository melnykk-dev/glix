/**
 * Easing functions shared by AnimationPlayer and Tween.
 * Godot-style names; every function takes t in [0, 1] and returns [0, 1].
 * 'step' is not an easing — discrete tracks hold the current keyframe.
 */
export type EasingName =
    | 'linear'
    | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
    | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
    | 'easeInQuart' | 'easeOutQuart'
    | 'easeInOutSine'
    | 'easeOutBack'
    | 'easeOutBounce'
    | 'easeOutElastic';

export const EASING_NAMES: EasingName[] = [
    'linear',
    'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
    'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
    'easeInQuart', 'easeOutQuart',
    'easeInOutSine',
    'easeOutBack',
    'easeOutBounce',
    'easeOutElastic',
];

const EASINGS: Record<EasingName, (t: number) => number> = {
    linear: (t) => t,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
    easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    easeInQuart: (t) => t * t * t * t,
    easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    easeOutBack: (t) => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    easeOutBounce: (t) => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) return n1 * t * t;
        if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
        if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
    },
    easeOutElastic: (t) => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        const c4 = (2 * Math.PI) / 3;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
};

/** Apply a named easing to t, clamped to [0, 1]. Unknown names fall back to linear. */
export function applyEasing(name: EasingName | string | undefined, t: number): number {
    const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
    const fn = (name && EASINGS[name as EasingName]) || EASINGS.linear;
    return fn(clamped);
}

/** Linear interpolation between two numbers. */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}
