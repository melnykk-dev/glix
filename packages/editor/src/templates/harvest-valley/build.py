#!/usr/bin/env python3
"""Build Harvest Valley (harvest-valley.glix) — the Glix proof game.

Reads the CURRENT topdown.glix and copies its farm art assets verbatim
(never edits topdown.glix), packs a 3-tile water set from the Kenney Tiny
Town pack (CC0) for the fishing pond, compiles the game scripts with
esbuild (the same TS->CJS shape the editor produces for compiledJs), and
writes harvest-valley.glix next to this script.

Re-run any time the scripts or the source art change:
    python3 build.py
"""
import base64
import io
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GLIX_DIR = os.path.dirname(HERE)  # packages/editor/src/templates
STAGE = os.path.expanduser("~/workspace/glix-revamp/assets-staging")
ESBUILD = os.path.expanduser(
    "~/workspace/glix-revamp/glix/packages/editor/node_modules/.bin/esbuild"
)

# Tilemap: 16 cols x 13 rows, transform (-8, 6.5).
# Tile (col,row) centre = (col - 7.5, 6.0 - row).
COLS, ROWS = 16, 13


def data_url(b: bytes, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(b).decode()


def compile_script(name: str) -> tuple[str, str]:
    src_path = os.path.join(HERE, "scripts", name + ".ts")
    with open(src_path, encoding="utf-8") as f:
        src = f.read()
    out_path = os.path.join(HERE, ".build-" + name + ".cjs")
    subprocess.run(
        [ESBUILD, src_path, "--format=cjs", "--platform=browser",
         "--outfile=" + out_path, "--log-level=error"],
        check=True,
    )
    with open(out_path, encoding="utf-8") as f:
        compiled = f.read()
    os.remove(out_path)
    return src, compiled


def script_component(name: str) -> dict:
    src, compiled = compile_script(name)
    return {"src": src, "compiledJs": compiled}


def tx(x: float, y: float, sx: float = 1, sy: float = 1) -> dict:
    return {"x": x, "y": y, "rotation": 0, "scaleX": sx, "scaleY": sy}


def sprite(region: str, w: float = 0.9, h: float = 0.9) -> dict:
    return {
        "textureId": "farm-atlas-tex",
        "width": w,
        "height": h,
        "pivotX": 0.5,
        "pivotY": 0.5,
        "region": region,
    }


def ysorted(layer: int = 1) -> dict:
    return {"layer": layer, "orderInLayer": 0, "ySort": layer == 1}


def dynamic_body(radius: float) -> dict:
    return {
        "transform": None,  # placeholder, replaced by caller
        "rigidBody": {
            "type": "dynamic",
            "gravityScale": 0,
            "linearDamping": 8,
            "angularDamping": 8,
            "fixedRotation": True,
        },
        "circleCollider": {
            "radius": radius,
            "offsetX": 0,
            "offsetY": 0,
            "isSensor": False,
            "restitution": 0,
            "friction": 0.1,
        },
    }


def main() -> None:
    with open(os.path.join(GLIX_DIR, "topdown.glix"), encoding="utf-8") as f:
        farm = json.load(f)

    # --- assets: copy farm art verbatim from the current topdown template ---
    assets = {}
    for aid in ("farm-tiles", "farm-tileset", "farm-atlas-tex", "farm-atlas", "ui-click"):
        assets[aid] = farm["assets"][aid]

    # --- pond water: pack Tiny Town tiles 108/109/110 (CC0) into a 3x1 sheet ---
    from PIL import Image

    tiles = []
    for tid in (108, 109, 110):
        p = os.path.join(STAGE, "tiny-town", "Tiles", f"tile_{tid:04d}.png")
        tiles.append(Image.open(p).convert("RGBA"))
    sheet = Image.new("RGBA", (48, 16), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * 16, 0))
    buf = io.BytesIO()
    sheet.save(buf, "PNG", optimize=True)
    town_png = buf.getvalue()
    assets["town-tiles"] = {
        "id": "town-tiles",
        "type": "texture",
        "name": "town-tiles",
        "mimeType": "image/png",
        "data": data_url(town_png, "image/png"),
    }
    assets["town-tileset"] = {
        "id": "town-tileset",
        "type": "tileset",
        "name": "town-tileset",
        "mimeType": "application/json",
        "data": json.dumps(
            {"textureId": "town-tiles", "tileWidth": 16, "tileHeight": 16,
             "columns": 3, "rows": 1, "spacing": 0}
        ),
    }

    # --- tilemap layers ---
    ground = [[0 for _ in range(COLS)] for _ in range(ROWS)]
    for r in range(2, 12):
        ground[r][7] = 12  # vertical dirt path
    for c in range(COLS):
        ground[8][c] = 24  # horizontal dirt path

    details = [[-1 for _ in range(COLS)] for _ in range(ROWS)]
    details[4][11] = 110  # bed (wooden frame, blue mattress)
    details[7][9] = 98  # shop counter, left
    details[7][10] = 99  # shop counter, right

    entities: list[dict] = []

    def add(eid: str, name: str, components: dict) -> None:
        entities.append({"id": eid, "name": name, "components": components})

    # Ground tilemap (layer 0) + pond tilemap (layer 0, drawn after ground).
    add("valley-ground", "Valley Ground", {
        "transform": tx(-8, 6.5),
        "sortingLayer": {"layer": 0, "orderInLayer": 0, "ySort": False},
        "tilemap": {
            "tilesetId": "farm-tileset",
            "layers": [
                {"name": "Ground", "visible": True, "opacity": 1.0, "tiles": ground},
                {"name": "Details", "visible": True, "opacity": 1.0, "tiles": details},
            ],
        },
    })
    add("pond", "Pond", {
        "transform": tx(-6, -2.5),
        "sortingLayer": {"layer": 0, "orderInLayer": 1, "ySort": False},
        "tilemap": {
            "tilesetId": "town-tileset",
            "layers": [
                {"name": "Water", "visible": True, "opacity": 1.0,
                 "tiles": [[0, 1, 1, 2], [0, 1, 1, 2]]},
            ],
        },
    })

    # Border trees (layer 1, ySort).
    tree_regions = ["tree_pine", "tree_pine_top", "tree_pine_tall"]
    tree_spots: list[tuple[float, float]] = []
    for x in [i - 7.5 for i in range(0, 11)]:  # top, x -7.5..2.5
        tree_spots.append((x, 4.0))
    for y in [3.0 - i for i in range(9)]:  # left + right columns
        tree_spots.append((-7.5, y))
        tree_spots.append((7.5, y))
    for x in [i - 7.5 for i in range(1, 15)]:  # bottom, x -6.5..6.5
        tree_spots.append((x, -6.0))
    for i, (x, y) in enumerate(tree_spots):
        add(f"tree-{i}", "Pine Tree", {
            "transform": tx(x, y),
            "sprite": sprite(tree_regions[i % 3], 1, 1),
            "sortingLayer": ysorted(),
        })

    # Barn / farmhouse (top-right). Walls x1/x3 are solid; x2 is the door gap.
    for i, (region, x) in enumerate(
        [("barn_roof_l", 3.5), ("barn_roof_m", 4.5), ("barn_roof_r", 5.5)]
    ):
        add(f"barn-roof-{i}", "Barn Roof", {
            "transform": tx(x, 4.0),
            "sprite": sprite(region, 1, 1),
            "sortingLayer": ysorted(),
        })
    wall_defs = [
        ("barn-wall-x1", "barn_wall_x1", 3.5, True),
        ("barn-wall-x2", "barn_wall_x2", 4.5, False),
        ("barn-wall-x3", "barn_wall_x3", 5.5, True),
    ]
    for eid, region, x, solid in wall_defs:
        comps: dict = {
            "transform": tx(x, 3.0),
            "sprite": sprite(region, 1, 1),
            "sortingLayer": ysorted(),
        }
        if solid:
            comps["rigidBody"] = {
                "type": "static", "gravityScale": 0, "linearDamping": 0,
                "angularDamping": 0, "fixedRotation": True,
            }
            comps["boxCollider"] = {
                "width": 1, "height": 1, "offsetX": 0, "offsetY": 0,
                "isSensor": False, "restitution": 0, "friction": 0.1,
            }
        add(eid, "Barn Wall", comps)

    # Invisible border walls (copied from the top-down template).
    for eid, name, x, y, sx, sy in [
        ("wall-top", "Wall Top", 0, 7, 17, 1),
        ("wall-bottom", "Wall Bottom", 0, -7, 17, 1),
        ("wall-left", "Wall Left", -8.5, 0, 1, 14),
        ("wall-right", "Wall Right", 8.5, 0, 1, 14),
    ]:
        add(eid, name, {
            "transform": tx(x, y, sx, sy),
            "rigidBody": {
                "type": "static", "gravityScale": 0, "linearDamping": 0,
                "angularDamping": 0, "fixedRotation": True,
            },
            "boxCollider": {
                "width": 1, "height": 1, "offsetX": 0, "offsetY": 0,
                "isSensor": False, "restitution": 0, "friction": 0.1,
            },
        })

    # Player.
    player_comps = {
        "transform": tx(-0.5, 2.5),
        "sprite": sprite("farmer_m"),
        "rigidBody": {
            "type": "dynamic", "gravityScale": 0, "linearDamping": 8,
            "angularDamping": 8, "fixedRotation": True,
        },
        "circleCollider": {
            "radius": 0.4, "offsetX": 0, "offsetY": 0,
            "isSensor": False, "restitution": 0, "friction": 0.1,
        },
        "sortingLayer": ysorted(),
        "script": script_component("PlayerController"),
    }
    add("player", "Player", player_comps)

    # Mira the villager + the yard chicken.
    for eid, name, region, x, y, radius in [
        ("mira", "Mira", "farmer_f", 0.5, -2.5, 0.4),
        ("chicken", "Chicken", "chicken", -6.5, -1.5, 0.3),
    ]:
        add(eid, name, {
            "transform": tx(x, y),
            "sprite": sprite(region),
            "rigidBody": {
                "type": "dynamic", "gravityScale": 0, "linearDamping": 8,
                "angularDamping": 8, "fixedRotation": True,
            },
            "circleCollider": {
                "radius": radius, "offsetX": 0, "offsetY": 0,
                "isSensor": False, "restitution": 0, "friction": 0.1,
            },
            "sortingLayer": ysorted(),
            "script": script_component("NpcWander"),
        })

    # Shop basket on the stall counter.
    add("shop-basket", "Basket", {
        "transform": tx(2.0, -1.0),
        "sprite": sprite("basket"),
        "sortingLayer": ysorted(),
    })

    # Game Manager (no sprite; owns all game state).
    add("game-manager", "Game Manager", {
        "transform": tx(0, 0),
        "script": script_component("GameManager"),
    })

    # --- UI entities (screen space; uiTransform anchor 0..1 of the canvas) ---
    def ui_label(eid: str, name: str, ax: float, ay: float, ox: float, oy: float,
                 text: str, size: int, color: str = "#ffffff") -> None:
        add(eid, name, {
            "uiTransform": {"anchorX": ax, "anchorY": ay, "pivotX": 0, "pivotY": 0,
                            "offsetX": ox, "offsetY": oy},
            "uiLabel": {"text": text, "fontSize": size, "color": color,
                        "fontFamily": "Arial"},
        })

    ui_label("hud-status", "HUD-Status", 0, 0, 12, 10, "", 18)
    ui_label("hud-inv", "HUD-Inv", 0, 0, 12, 36, "", 15)
    ui_label("hud-hint", "HUD-Hint", 0, 1, 12, -16, "", 15, "#ffe9a8")
    add("dialogue-panel", "Dialogue-Panel", {
        "uiTransform": {"anchorX": 0.5, "anchorY": 1, "pivotX": 0, "pivotY": 0,
                        "offsetX": -280, "offsetY": 2000},
        "uiPanel": {"width": 560, "height": 110, "color": "#1A1A2E", "borderRadius": 8},
    })
    ui_label("dialogue-text", "Dialogue-Text", 0.5, 1, -268, 2000, "", 16)
    shop_buttons = [
        ("shop-btn-1", "Shop-Btn-1", "1 Tomato 10c", "hv:shop-buy-tomato", -268),
        ("shop-btn-2", "Shop-Btn-2", "2 Carrot 15c", "hv:shop-buy-carrot", -140),
        ("shop-btn-3", "Shop-Btn-3", "3 Sell all", "hv:shop-sell-all", -12),
        ("shop-btn-4", "Shop-Btn-4", "4 Close", "hv:shop-close", 116),
    ]
    for eid, name, label, event, ox in shop_buttons:
        add(eid, name, {
            "uiTransform": {"anchorX": 0.5, "anchorY": 1, "pivotX": 0, "pivotY": 0,
                            "offsetX": ox, "offsetY": 2000},
            "uiButton": {"normalColor": "#533483", "hoverColor": "#E94560",
                         "pressColor": "#1A1A2E", "onClick": event},
            "uiLabel": {"text": label, "fontSize": 14, "color": "#ffffff",
                        "fontFamily": "Arial"},
        })

    def ui_bar(eid: str, name: str, ox: float, oy: float, w: int, h: int,
               fill: str, bg: str) -> None:
        add(eid, name, {
            "uiTransform": {"anchorX": 0.5, "anchorY": 1, "pivotX": 0, "pivotY": 0,
                            "offsetX": ox, "offsetY": oy},
            "uiProgressBar": {"value": 100, "max": 100, "fillColor": fill,
                              "bgColor": bg, "width": w, "height": h},
        })

    ui_bar("fishing-bg", "Fishing-Bg", -150, 2000, 300, 18, "#533483", "#222222")
    ui_bar("fishing-zone", "Fishing-Zone", -45, 2000, 90, 18, "#22c55e", "#22c55e")
    ui_bar("fishing-marker", "Fishing-Marker", -156, 2000, 12, 22, "#ffd23f", "#ffd23f")

    project = {
        "version": "1.0.0",
        "meta": {"name": "Harvest Valley", "resolution": {"width": 1280, "height": 720}},
        "assets": assets,
        "prefabs": {},
        "scenes": {
            "main": {
                "id": "main",
                "name": "Main Scene",
                "entities": entities,
            }
        },
        "settings": {
            "startScene": "main",
            "physics": {"gravity": {"x": 0, "y": 0}},
            "postProcess": {"bloom": False, "vignette": False, "crt": False,
                            "bloomThreshold": 0.8, "vignetteStrength": 0.3},
            "input": {},
        },
    }

    out = os.path.join(HERE, "harvest-valley.glix")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(project, f, indent=1)
    print(f"wrote {out} ({os.path.getsize(out)} bytes, {len(entities)} entities)")


if __name__ == "__main__":
    main()
