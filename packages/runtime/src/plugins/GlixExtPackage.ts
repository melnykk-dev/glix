/**
 * `.glixext` zip packaging — PLUGIN_SPEC.md §1.
 *
 * A package is a standard ZIP (deflate) with `glixext.json` at the root.
 * The ZIP container itself lives in `@glix/shared` (`project/zip.ts`,
 * written by the format-v2 team — one ZIP implementation for `.glix` and
 * `.glixext`, so the two formats cannot drift apart). This module adds
 * only the `.glixext` rules on top of it:
 * - whole package over 25 MB uncompressed → rejected (spec §1);
 * - all failures surface as plain-language `ExtensionLoadError`s with
 *   `.glixext` wording (the shared errors talk about `.glix` files).
 *
 * Do NOT write a second ZIP container here. If the container needs
 * fixing, fix it in `shared/src/project/zip.ts` and re-run both harnesses.
 */
import { zipFiles, unzipFiles } from '@glix/shared/src/project/zip';
import { ExtensionLoadError } from './ExtensionManifest';

export const MAX_GLIXEXT_BYTES = 25 * 1024 * 1024;

function toBytes(value: string | Uint8Array): Uint8Array {
    return typeof value === 'string' ? new TextEncoder().encode(value) : value;
}

function reword(message: string): string {
    return message
        .replace(/\.glix file/g, 'extension package')
        .replace(/This project/g, 'This extension package')
        .replace(/the project folder/g, 'the package folder');
}

/** Packs `files` (`filename -> content`) into a `.glixext` zip. */
export async function packGlixExt(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
    const entries = Object.keys(files)
        .sort()
        .map((name) => ({ name, data: toBytes(files[name]) }));
    const total = entries.reduce((n, e) => n + e.data.length, 0);
    if (total > MAX_GLIXEXT_BYTES) {
        throw new ExtensionLoadError(
            `This extension package is too large: it holds ${(total / 1024 / 1024).toFixed(1)} MB, ` +
            'but extensions are limited to 25 MB.',
        );
    }
    try {
        return await zipFiles(entries);
    } catch (err) {
        throw new ExtensionLoadError(
            `This extension package could not be packed: ${reword((err as Error).message)}`,
        );
    }
}

/** Unpacks a `.glixext` zip into `filename -> bytes`. */
export async function unpackGlixExt(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
    let files: Map<string, Uint8Array>;
    try {
        files = await unzipFiles(bytes);
    } catch (err) {
        throw new ExtensionLoadError(
            `This extension package could not be opened: ${reword((err as Error).message)}`,
        );
    }
    let total = 0;
    for (const data of files.values()) total += data.length;
    if (total > MAX_GLIXEXT_BYTES) {
        throw new ExtensionLoadError(
            `This extension package is too large: it unpacks to ${(total / 1024 / 1024).toFixed(1)} MB, ` +
            'but extensions are limited to 25 MB.',
        );
    }
    return files;
}

/** Decodes a text file from an unpacked package (UTF-8). */
export function packageTextFile(files: Map<string, Uint8Array>, name: string): string {
    const bytes = files.get(name);
    if (!bytes) {
        throw new ExtensionLoadError(
            `This extension package is missing "${name}".`,
        );
    }
    return new TextDecoder('utf-8').decode(bytes);
}
