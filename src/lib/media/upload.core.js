import path from 'node:path';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { AppError } from '../error/error.js';
import { logger } from '../../pkg/logger/logger.js';

const UPLOADS = 'uploads';
// folder names come from our code, never from the user
const FOLDER_PATTERN = /^[a-z0-9_-]{1,40}$/;

// req.file (single) | req.files (array) | req.files (fields object)
export function collectFiles(req) {
    if (req.file) return [req.file];
    if (Array.isArray(req.files)) return req.files;
    if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
    return [];
}

// factory: `detect(buffer)` returns { mime, ext } | undefined (file-type), `fs` is node:fs/promises
export function createUploadPipeline({
    detect,
    fs = fsp,
    rootDir = process.cwd(),
    randomId = () => crypto.randomUUID(),
}) {
    const uploadsRoot = path.resolve(rootDir, UPLOADS);

    // stored value ("/uploads/x/y.png" or the old "uploads\y.png") -> absolute path, or null if it is
    // not strictly inside uploads/ (so a bad value in the DB can never delete anything else)
    function toDiskPath(stored) {
        if (typeof stored !== 'string' || stored.includes('\0')) return null;
        const normalized = stored.replace(/\\/g, '/').replace(/^\/+/, '');
        if (!normalized.startsWith(`${UPLOADS}/`)) return null;
        const resolved = path.resolve(rootDir, normalized);
        return resolved.startsWith(uploadsRoot + path.sep) ? resolved : null;
    }

    // best effort: never throws (a missing old file must not fail the request)
    async function removeStored(paths) {
        const list = [].concat(paths ?? []);
        for (const stored of list) {
            if (!stored) continue;
            const disk = toDiskPath(stored);
            if (!disk) {
                logger.error('refused to delete a path outside uploads', { path: String(stored) });
                continue;
            }
            try {
                await fs.unlink(disk);
            } catch (err) {
                if (err?.code !== 'ENOENT') logger.error('failed to delete file', { path: disk, error: err.message });
            }
        }
    }

    // 1) check EVERY file by its real content, 2) only then write. All or nothing.
    async function saveAll(files, allowedTypes, folder) {
        if (!FOLDER_PATTERN.test(folder)) throw new Error(`invalid upload folder: ${folder}`);

        const detected = [];
        for (const file of files) {
            const type = file.buffer ? await detect(file.buffer) : undefined;
            if (!type || !allowedTypes.includes(type.mime)) throw new AppError('invalid file type', 400);
            detected.push(type);
        }

        const dir = path.join(rootDir, UPLOADS, folder);
        await fs.mkdir(dir, { recursive: true });

        const written = [];
        const names = [];
        try {
            for (const [i, file] of files.entries()) {
                const name = `${randomId()}.${detected[i].ext}`;
                const target = path.join(dir, name);
                await fs.writeFile(target, file.buffer);
                written.push(target);
                names.push(name);
            }
        } catch (err) {
            for (const target of written) await fs.unlink(target).catch(() => {});
            throw err;
        }

        for (const [i, file] of files.entries()) {
            file.path = `${UPLOADS}/${folder}/${names[i]}`;
            file.url = `/${UPLOADS}/${folder}/${names[i]}`;
            file.mimetype = detected[i].mime; // the real type, not what the client claimed
            delete file.buffer;               // free the memory
        }
        return files;
    }

    return { saveAll, removeStored, toDiskPath };
}

// usage: fileValidation(allowedTypes, folder)
export function createFileValidation({ pipeline, defaultTypes }) {
    return (allowedTypes = defaultTypes, folder = 'general') => {
        if (!FOLDER_PATTERN.test(folder)) throw new Error(`invalid upload folder: ${folder}`); // fails at startup

        return async (req, res, next) => {
            try {
                const files = collectFiles(req);
                if (files.length === 0) throw new AppError('file is required', 400);
                await pipeline.saveAll(files, allowedTypes, folder);
                next();
            } catch (error) {
                next(error);
            }
        };
    };
}