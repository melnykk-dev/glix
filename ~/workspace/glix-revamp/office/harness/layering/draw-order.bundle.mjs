// packages/runtime/src/systems/DrawOrder.ts
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : void 0;
}
function getTransform(world, entity) {
  return asRecord(world.getComponent(entity, "transform"));
}
function getWorldY(world, entity) {
  let y = 0;
  let current = entity;
  const seen = /* @__PURE__ */ new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const t = getTransform(world, current);
    if (!t) break;
    y += typeof t.y === "number" ? t.y : 0;
    current = typeof t.parent === "string" ? t.parent : void 0;
  }
  return y;
}
function getWorldScaleY(world, entity) {
  let s = 1;
  let current = entity;
  const seen = /* @__PURE__ */ new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const t = getTransform(world, current);
    if (!t) break;
    if (typeof t.scaleY === "number") s *= t.scaleY;
    current = typeof t.parent === "string" ? t.parent : void 0;
  }
  return s;
}
function getBottomEdge(world, entity) {
  const y = getWorldY(world, entity);
  const sy = getWorldScaleY(world, entity);
  const sprite = asRecord(world.getComponent(entity, "sprite"));
  if (sprite && typeof sprite.height === "number") {
    return y - sprite.height * sy / 2;
  }
  const tilemap = asRecord(world.getComponent(entity, "tilemap"));
  if (tilemap && Array.isArray(tilemap.layers)) {
    const rows = Math.max(0, ...tilemap.layers.map((l) => Array.isArray(l.tiles) ? l.tiles.length : 0));
    const th = typeof tilemap.tileHeight === "number" ? tilemap.tileHeight : 1;
    return y - rows * th * sy;
  }
  return y;
}
function getLayer(world, entity) {
  const sl = asRecord(world.getComponent(entity, "sortingLayer"));
  return {
    layer: typeof sl?.layer === "number" ? sl.layer : 0,
    order: typeof sl?.orderInLayer === "number" ? sl.orderInLayer : 0,
    ySort: sl?.ySort === true
  };
}
function compareDrawOrder(world, a, b) {
  const A = getLayer(world, a);
  const B = getLayer(world, b);
  if (A.layer !== B.layer) return A.layer - B.layer;
  if (A.ySort && B.ySort) {
    const bottomA = getBottomEdge(world, a);
    const bottomB = getBottomEdge(world, b);
    if (bottomA !== bottomB) return bottomB - bottomA;
  }
  if (A.order !== B.order) return A.order - B.order;
  return 0;
}
function sortDrawables(world, entities) {
  return [...entities].sort((a, b) => compareDrawOrder(world, a, b));
}
export {
  compareDrawOrder,
  getBottomEdge,
  getWorldY,
  sortDrawables
};
