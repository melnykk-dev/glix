// glow-component — example .glixext extension.
// Registers a single "glow" component. No systems, no network, no storage,
// so its manifest only asks for the "components.register" permission.
//
// The default export is the extension definition object. `ctx` is the only
// thing this file can reach: the loader sandboxes it away from window,
// document, fetch and the engine itself. Systems and components may only
// be registered inside activate(); install() is for storage setup only.
export default {
    activate(ctx) {
        ctx.components.register('glow', {
            intensity: 1,
            color: '#ffd166',
        });
        ctx.log.info('glow component registered.');
    },
};
