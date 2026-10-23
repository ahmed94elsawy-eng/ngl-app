import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { fileTypeFromBuffer } from 'file-type';
import { createUploadPipeline, createFileValidation } from '../../src/lib/media/upload.core.js';
import { uploadSingleFile, uploadFilesArray } from '../../src/lib/media/multer.js';
import { allowedFields } from '../../src/lib/media/file.validation.js';
import { globalErrorHandler } from '../../src/lib/error/error.handler.js';

// a real 1x1 PNG, detected by the real file-type library
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64');

let server, base, tmp;

async function listFiles(dir) {
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
    const out = [];
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...await listFiles(p)); else out.push(p);
    }
    return out;
}

function form(field, items) {
    const fd = new FormData();
    for (const { bytes, type, name } of items) fd.append(field, new Blob([bytes], { type }), name);
    return fd;
}

const post = (url, body) => fetch(`${base}${url}`, { method: 'POST', body });

before(async () => {
    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'ngl-upload-'));
    const pipeline = createUploadPipeline({ detect: fileTypeFromBuffer, rootDir: tmp });
    const fileValidation = createFileValidation({ pipeline, defaultTypes: allowedFields.images });

    const app = express();
    app.post('/pic', uploadSingleFile('pp'), fileValidation(allowedFields.images, 'profile'),
        (req, res) => res.json({ url: req.file.url, size: req.file.size }));
    app.post('/covers', uploadFilesArray('cover-images', 3), fileValidation(allowedFields.images, 'covers'),
        (req, res) => res.json({ urls: req.files.map((f) => f.url) }));
    app.use(globalErrorHandler);

    await new Promise((r) => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((r) => server.close(r));
    await fsp.rm(tmp, { recursive: true, force: true });
});

test('a real PNG is saved as uploads/profile/<uuid>.png without the client file name', async () => {
    const res = await post('/pic', form('pp', [{ bytes: PNG, type: 'image/png', name: 'my photo.png' }]));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.url, /^\/uploads\/profile\/[0-9a-f-]{36}\.png$/);
    assert.equal(body.url.includes('my'), false);
    assert.deepEqual(await fsp.readFile(path.join(tmp, body.url)), PNG);
});

test('a text file pretending to be a PNG is rejected (400) and nothing reaches the disk', async () => {
    const before = await listFiles(tmp);
    const res = await post('/pic', form('pp', [{ bytes: Buffer.from('<script>alert(1)</script>'), type: 'image/png', name: 'a.png' }]));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).success, false);
    assert.deepEqual(await listFiles(tmp), before);
});

test('a claimed type that is not allowed is rejected before reading the file', async () => {
    const res = await post('/pic', form('pp', [{ bytes: PNG, type: 'application/pdf', name: 'a.pdf' }]));
    assert.equal(res.status, 400);
});

test('a file over 5MB -> 413 and nothing is saved', async () => {
    const before = await listFiles(tmp);
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    const res = await post('/pic', form('pp', [{ bytes: big, type: 'image/png', name: 'big.png' }]));
    assert.equal(res.status, 413);
    assert.deepEqual(await listFiles(tmp), before);
});

test('no file -> 400, wrong field name -> 400', async () => {
    const empty = new FormData();
    empty.append('x', 'y');
    assert.equal((await post('/pic', empty)).status, 400);
    assert.equal((await post('/pic', form('other', [{ bytes: PNG, type: 'image/png', name: 'a.png' }]))).status, 400);
});

test('3 images are saved, a 4th makes the whole request fail and saves nothing', async () => {
    const item = { bytes: PNG, type: 'image/png', name: 'c.png' };
    const ok = await post('/covers', form('cover-images', [item, item, item]));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).urls.length, 3);

    const before = await listFiles(tmp);
    const tooMany = await post('/covers', form('cover-images', [item, item, item, item]));
    assert.equal(tooMany.status, 400);
    assert.deepEqual(await listFiles(tmp), before);
});

test('one fake image among real ones: none of them is saved', async () => {
    const before = await listFiles(tmp);
    const res = await post('/covers', form('cover-images', [
        { bytes: PNG, type: 'image/png', name: 'a.png' },
        { bytes: Buffer.from('not an image'), type: 'image/png', name: 'b.png' },
    ]));
    assert.equal(res.status, 400);
    assert.deepEqual(await listFiles(tmp), before);
});