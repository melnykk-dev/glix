/**
 * Node harness for format v2 (PROJECT_FORMAT_v2.md §6–§8).
 * Run from the repo root: the build script bundles this file with esbuild
 * and runs it with node. NOT exported from @glix/shared.
 *
 * Proves: v1 templates migrate; assets round-trip by hash (incl. dedupe and
 * fonts); pack/unpack is byte-identical for scenes; bad project.json is
 * rejected in plain language; a tampered asset is a placeholder, not a crash;
 * plugins[] persists; zip-slip entries are rejected.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrateV1ToV2, sha256Hex } from './src/project/migrate';
import { packProject, unpackProject, zipFiles, unzipFiles, verifyAssetHashes } from './src/project/zip';
import { parseProjectJson } from './src/project/ProjectV2';
import { AssetRefSchema } from './src/assets/AssetRecord';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
    if (ok) {
        passed += 1;
        console.log(`  PASS ${name}`);
    } else {
        failed += 1;
        console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
}
const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// --- fixtures -----------------------------------------------------------------
// 1x1 red PNG (real bytes), 44-byte WAV header, fake TTF bytes.
const PNG_1X1_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WAV_B64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const TTF_B64 = Buffer.from('fake-ttf-bytes-for-harness').toString('base64');

function v1Doc(): Record<string, unknown> {
    return {
        version: '0.1.0',
        meta: { name: 'Harness Game', resolution: { width: 1280, height: 720 } },
        assets: {
            hero: { id: 'hero', type: 'texture', name: 'hero.png', mimeType: 'image/png', data: `data:image/png;base64,${PNG_1X1_B64}` },
            heroCopy: { id: 'hero-copy', type: 'texture', name: 'hero-copy.png', mimeType: 'image/png', data: `data:image/png;base64,${PNG_1X1_B64}` },
            sfx: { id: 'sfx', type: 'audio', name: 'sfx.wav', mimeType: 'audio/wav', data: `data:audio/wav;base64,${WAV_B64}` },
            font: { id: 'font', type: 'texture', name: 'font.ttf', mimeType: 'font/ttf', data: `data:font/ttf;base64,${TTF_B64}` },
            atlas: { id: 'atlas', type: 'spriteatlas', name: 'atlas.json', mimeType: 'application/json', data: JSON.stringify({ textureId: 'hero', regions: { idle: { x: 0, y: 0, w: 16, h: 16 } } }) },
            broken: { id: 'broken', type: 'texture', name: 'broken.png', mimeType: 'image/png', data: '' },
        },
        prefabs: {
            player: { id: 'player', name: 'Player', components: { transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } } },
        },
        scenes: {
            main: { id: 'main', name: 'Main Scene', entities: [{ id: 'e1', name: 'Hero', components: { sprite: { textureId: 'hero', width: 32, height: 32, pivotX: 0.5, pivotY: 0.5 } } }] },
            menu: { id: 'menu', name: 'Menu', entities: [] },
        },
        settings: {
            startScene: 'main',
            physics: { gravity: { x: 0, y: 9.8 } },
            postProcess: { bloom: true, vignette: false, crt: false, bloomThreshold: 0.8, vignetteStrength: 0.3 },
            input: { jump: ['Space', 'KeyW'], pause: ['Escape'] },
            touchControls: 'auto',
        },
    };
}

async function main(): Promise<void> {
    const root = process.cwd();
    const templatesDir = join(root, 'packages', 'editor', 'src', 'templates');
    const repack = async (files: Map<string, Uint8Array>): Promise<Uint8Array> =>
        zipFiles([...files.entries()].map(([name, data]) => ({ name, data })));

    console.log('== 1. v1 templates migrate ==');
    for (const file of ['empty', 'platformer']) {
        const raw = JSON.parse(readFileSync(join(templatesDir, `${file}.glix`), 'utf-8'));
        const bundle = await migrateV1ToV2(raw);
        check(`${file}.glix migrates to valid v2`, bundle.project.formatVersion === '2.0.0');
        check(`${file}.glix start scene`, bundle.project.settings.startScene === 'main');
        check(`${file}.glix scenes split`, bundle.report.scenesSplit === 1 && bundle.project.scenes.length === 1);
        check(`${file}.glix no assets lost`, bundle.report.assetsSkipped.length === 0);
        check(`${file}.glix input map present`, 'move_left' in bundle.project.input.actions);
    }

    console.log('== 2. synthetic v1 with real assets migrates ==');
    const bundle = await migrateV1ToV2(v1Doc(), {
        plugins: [{ id: 'com.glix.glow-component', version: '1.0.0', enabled: false }],
    });
    const { project, blobs, report } = bundle;
    check('6 assets in, 5 extracted + 1 skipped (empty data)', report.assetsExtracted === 5 && report.assetsSkipped.length === 1);
    check('skipped asset is "broken"', report.assetsSkipped[0]?.id === 'broken');
    check('2 scenes + 1 prefab split', report.scenesSplit === 2 && report.prefabsSplit === 1);
    check('no dropped settings', report.droppedSettings.length === 0);
    check('start scene kept', project.settings.startScene === 'main');
    check('v1 input codes became keyboard bindings',
        eq(project.input.actions.jump?.bindings, [
            { device: 'keyboard', code: 'Space' },
            { device: 'keyboard', code: 'KeyW' },
        ]));
    check('default actions still present', 'move_left' in project.input.actions && 'action_primary' in project.input.actions);

    console.log('== 3. assets round-trip by hash ==');
    const pngBytes = Buffer.from(PNG_1X1_B64, 'base64');
    const pngHash = await sha256Hex(new Uint8Array(pngBytes));
    const heroRef = project.assets['hero'];
    check('hero ref file is content-addressed', heroRef.file === `assets/${pngHash}.png`);
    check('hero ref sha256 matches recomputed hash', heroRef.sha256 === pngHash);
    check('hero blob bytes round-trip identical', Buffer.from(blobs[heroRef.file]).equals(pngBytes));
    check('duplicate content dedupes to one blob',
        project.assets['hero-copy'].file === heroRef.file && Object.keys(blobs).length === 4);
    check('font asset migrates with mime font/ttf', project.assets['font'].mimeType === 'font/ttf');
    check('spriteatlas JSON payload extracted as blob',
        project.assets['atlas'].file.endsWith('.json') && blobs[project.assets['atlas'].file].length > 0);

    console.log('== 4. font records validate in project.json (the one-line gap) ==');
    const fontRef = AssetRefSchema.safeParse({
        id: 'my-font', type: 'font', name: 'font.ttf', mimeType: 'font/ttf',
        file: 'assets/abc123.ttf', sha256: 'a'.repeat(64), size: 12,
    });
    check("AssetRefSchema accepts type 'font'", fontRef.success);
    const badRef = AssetRefSchema.safeParse({
        id: 'x', type: 'pdf', name: 'x.pdf', mimeType: 'application/pdf',
        file: 'assets/abc123.pdf', sha256: 'a'.repeat(64), size: 1,
    });
    check("AssetRefSchema still rejects unknown types", !badRef.success);

    console.log('== 5. pack / unpack round-trip ==');
    const zip = await packProject(bundle);
    writeFileSync('/tmp/glix-v2-test.glix', zip);
    check('zip is a real zip (PK header)', zip[0] === 0x50 && zip[1] === 0x4b);
    const unpacked = await unpackProject(zip);
    check('unpacked project deep-equals original', eq(unpacked.project, project));
    check('unpacked scenes deep-equal original',
        eq([...unpacked.scenes.entries()], Object.entries(bundle.scenes)));
    check('unpacked prefabs deep-equal original',
        eq([...unpacked.prefabs.entries()], Object.entries(bundle.prefabs)));
    check('unpacked blobs deep-equal original',
        [...unpacked.blobs.entries()].every(([k, v]) => Buffer.from(v).equals(Buffer.from(blobs[k]))));
    check('no broken assets on a clean round-trip', unpacked.brokenAssets.length === 0);
    check('plugins[] persists and restores',
        eq(unpacked.project.plugins, [{ id: 'com.glix.glow-component', version: '1.0.0', enabled: false }]));
    check('scene JSON is identical after round-trip',
        JSON.stringify(unpacked.scenes.get('scenes/main.json')) === JSON.stringify(bundle.scenes['scenes/main.json']));

    console.log('== 6. bad project.json is rejected in plain language ==');
    const badManifest = JSON.parse(JSON.stringify(project));
    badManifest.formatVersion = '9.9.9';
    const badFiles = await unzipFiles(zip);
    badFiles.set('project.json', new TextEncoder().encode(JSON.stringify(badManifest)));
    const badZip = await repack(badFiles);
    let badError = '';
    try {
        await unpackProject(badZip);
    } catch (e) {
        badError = e instanceof Error ? e.message : String(e);
    }
    check('bad formatVersion throws', badError.length > 0, badError);
    check('error is plain language (no zod jargon)', !/ZodError|invalid_literal|expected/i.test(badError) || /not a valid Glix/i.test(badError), badError);
    let missingManifestError = '';
    try {
        const files = await unzipFiles(zip);
        files.delete('project.json');
        await unpackProject(await repack(files));
    } catch (e) {
        missingManifestError = e instanceof Error ? e.message : String(e);
    }
    check('missing project.json throws plainly', /no project\.json/i.test(missingManifestError), missingManifestError);

    console.log('== 7. tampered asset is a placeholder, not a crash ==');
    const tamperedFiles = await unzipFiles(zip);
    const heroBlob = tamperedFiles.get(heroRef.file);
    if (heroBlob) {
        const copy = heroBlob.slice();
        copy[10] = copy[10] === 0 ? 1 : 0;
        tamperedFiles.set(heroRef.file, copy);
    }
    const tampered = await unpackProject(await repack(tamperedFiles));
    check('project still opens with a tampered asset', tampered.project.meta.name === 'Harness Game');
    check('tampered asset listed in brokenAssets', tampered.brokenAssets.includes('hero'));
    check('verifyAssetHashes agrees', (await verifyAssetHashes(project, tampered.blobs)).includes('hero'));

    console.log('== 8. zip-slip is rejected ==');
    let slipError = '';
    try {
        await unzipFiles(await zipFiles([{ name: '../evil.json', data: new TextEncoder().encode('{}') }]));
    } catch (e) {
        slipError = e instanceof Error ? e.message : String(e);
    }
    check('../ entry rejected', /escapes|not allowed/i.test(slipError), slipError);
    let absError = '';
    try {
        await unzipFiles(await zipFiles([{ name: '/etc/passwd', data: new TextEncoder().encode('x') }]));
    } catch (e) {
        absError = e instanceof Error ? e.message : String(e);
    }
    check('absolute path rejected', /not allowed/i.test(absError), absError);

    console.log('== 9. parseProjectJson rejects garbage ==');
    let garbageError = '';
    try {
        parseProjectJson('{not json');
    } catch (e) {
        garbageError = e instanceof Error ? e.message : String(e);
    }
    check('non-JSON rejected plainly', /not valid JSON/i.test(garbageError), garbageError);
    let emptyError = '';
    try {
        // Valid meta/settings, only the scene list is wrong, so the scene
        // error is the one that surfaces.
        const good = JSON.parse(JSON.stringify(project));
        good.scenes = [];
        parseProjectJson(JSON.stringify(good));
    } catch (e) {
        emptyError = e instanceof Error ? e.message : String(e);
    }
    check('zero scenes rejected plainly', /at least one scene/i.test(emptyError), emptyError);

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((e) => {
    console.error('HARNESS CRASH:', e instanceof Error ? e.message : e);
    process.exit(1);
});
