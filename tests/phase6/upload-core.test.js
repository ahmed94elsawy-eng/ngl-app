import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createUploadPipeline, createFileValidation, collectFiles } from '../../src/lib/media/upload.core.js';
import { allowedFields } from '../../src/lib/media/file.validation.js';

const ROOT = path.resolve('fake-root');
const status = (code) => (err) => err.statusCode === code;

// first byte decides the "real" type
const detect = async (buf) =>
    buf[0] === 1 ? { mime: 'image/png', ext: 'png' }
    : buf[0] === 2 ? { mime: 'application/pdf', ext: 'pdf' }
    : undefined;

function build(fsOver = {}) {
    const files = new Map();
    const log = [];
    const fs = {
        files, log,
        async mkdir(p) { log.push(['mkdir', p]); },
        async writeFile(p, data) { files.set(p, data); log.push(['write', p]); },
        async unlink(p) {
            log.push(['unlink', p]);
            if (!files.has(p)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
            files.delete(p);
        },
        ...fsOver,
    };
    let n = 0;
    const pipeline = createUploadPipeline({ detect, fs, rootDir: ROOT, randomId: () => `id${++n}` });
    return { pipeline, fs };
}

const file = (bytes, extra = {}) => ({ originalname: 'x.png', mimetype: 'image/png', size: bytes.length, buffer: Buffer.from(bytes), ...extra });

test('saves to uploads/<folder>/<id>.<real ext>, ignoring the client name and claimed type', async () => {
    const { pipeline, fs } = build();
    const f = file([1, 9, 9], { originalname: '../../evil.php', mimetype: 'text/html' });
    await pipeline.saveAll([f], ['image/png'], 'profile');
    assert.equal(f.url, '/uploads/profile/id1.png');
    assert.equal(f.path, 'uploads/profile/id1.png');
    assert.equal(f.mimetype, 'image/png');
    assert.equal('buffer' in f, false);
    assert.ok(fs.files.has(path.join(ROOT, 'uploads', 'profile', 'id1.png')));
});

test('a fake file (wrong magic number) is rejected with 400 and nothing is written', async () => {
    const { pipeline, fs } = build();
    await assert.rejects(() => pipeline.saveAll([file([0, 0, 0])], ['image/png'], 'profile'), status(400));
    assert.equal(fs.log.length, 0);
});

test('a real file of a type that is not allowed here is rejected', async () => {
    const { pipeline } = build();
    await assert.rejects(() => pipeline.saveAll([file([2, 0])], ['image/png'], 'profile'), status(400));
});

test('an entry without a buffer is rejected', async () => {
    const { pipeline } = build();
    await assert.rejects(() => pipeline.saveAll([{ originalname: 'x' }], ['image/png'], 'profile'), status(400));
});

test('all or nothing: one invalid file means no file is written', async () => {
    const { pipeline, fs } = build();
    await assert.rejects(
        () => pipeline.saveAll([file([1]), file([0])], ['image/png'], 'covers'), status(400));
    assert.equal(fs.files.size, 0);
    assert.equal(fs.log.length, 0);
});

test('a write failure removes the files already written', async () => {
    let calls = 0;
    const { pipeline, fs } = build({
        async writeFile(p, data) {
            if (++calls === 2) throw new Error('disk full');
            this.files.set(p, data);
        },
    });
    await assert.rejects(() => pipeline.saveAll([file([1]), file([1])], ['image/png'], 'covers'), /disk full/);
    assert.equal(fs.files.size, 0);
});

test('invalid folder names are refused (also at startup in createFileValidation)', async () => {
    const { pipeline } = build();
    await assert.rejects(() => pipeline.saveAll([file([1])], ['image/png'], '../x'), /invalid upload folder/);
    assert.throws(() => createFileValidation({ pipeline, defaultTypes: [] })(undefined, 'a/b'), /invalid upload folder/);
});

test('toDiskPath: accepts uploads paths (new and old format), refuses everything else', () => {
    const { pipeline } = build();
    assert.equal(pipeline.toDiskPath('/uploads/profile/a.png'), path.join(ROOT, 'uploads', 'profile', 'a.png'));
    assert.equal(pipeline.toDiskPath('uploads\\a-b.png'), path.join(ROOT, 'uploads', 'a-b.png'));
    for (const bad of ['/uploads/../secret.txt', 'uploads/../../x', '/etc/passwd', 'uploads/', 'uploads',
        'https://x.com/uploads/a.png', 'src/app.js', '', undefined, null, 5, 'uploads/a\0.png']) {
        assert.equal(pipeline.toDiskPath(bad), null, String(bad));
    }
});

test('removeStored: deletes existing files, accepts one path or a list, ignores empty values', async () => {
    const { pipeline, fs } = build();
    const a = path.join(ROOT, 'uploads', 'profile', 'a.png');
    const b = path.join(ROOT, 'uploads', 'covers', 'b.png');
    fs.files.set(a, 1);
    fs.files.set(b, 1);
    await pipeline.removeStored('/uploads/profile/a.png');
    await pipeline.removeStored(['/uploads/covers/b.png', undefined, '']);
    await pipeline.removeStored(undefined);
    assert.equal(fs.files.size, 0);
});

test('removeStored never throws: a missing file or a failing unlink is fine', async () => {
    const { pipeline } = build();
    await pipeline.removeStored('/uploads/profile/missing.png'); // ENOENT
    const broken = build({ async unlink() { throw Object.assign(new Error('locked'), { code: 'EBUSY' }); } });
    await broken.pipeline.removeStored('/uploads/profile/a.png');
});

test('removeStored never touches paths outside uploads', async () => {
    const { pipeline, fs } = build();
    await pipeline.removeStored(['/etc/passwd', 'uploads/../../x', 'src/app.js']);
    assert.equal(fs.log.filter(([op]) => op === 'unlink').length, 0);
});

test('collectFiles handles single, array and fields shapes', () => {
    assert.deepEqual(collectFiles({ file: 'a' }), ['a']);
    assert.deepEqual(collectFiles({ files: ['a', 'b'] }), ['a', 'b']);
    assert.deepEqual(collectFiles({ files: { x: ['a'], y: ['b', 'c'] } }), ['a', 'b', 'c']);
    assert.deepEqual(collectFiles({}), []);
});

test('middleware: no file -> 400, valid -> next() without error, saves with the default types', async () => {
    const { pipeline, fs } = build();
    const mw = createFileValidation({ pipeline, defaultTypes: ['image/png'] })(undefined, 'profile');

    let arg = 'not-called';
    await mw({}, {}, (e) => { arg = e; });
    assert.equal(arg.statusCode, 400);

    const req = { file: file([1]) };
    arg = 'not-called';
    await mw(req, {}, (e) => { arg = e; });
    assert.equal(arg, undefined);
    assert.equal(fs.files.size, 1);
});

test('middleware: a fake file is passed to the error handler', async () => {
    const { pipeline } = build();
    const mw = createFileValidation({ pipeline, defaultTypes: ['image/png'] })();
    let arg;
    await mw({ file: file([0]) }, {}, (e) => { arg = e; });
    assert.equal(arg.statusCode, 400);
});

test('allowedFields: pdf only for documents, audio uses the real mime type', () => {
    assert.deepEqual(allowedFields.files, ['application/pdf']);
    assert.deepEqual(allowedFields.audios, ['audio/mpeg']);
    assert.deepEqual(allowedFields.images, ['image/png', 'image/jpeg']);
});