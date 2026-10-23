import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createUserService } from '../../src/app/user/service/user.core.js';

const file = (url) => ({ url });

function build(user, over = {}) {
    const calls = [];
    const userRepository = {
        findUserById: async () => user,
        updateUserById: async (id, data) => { calls.push(['update', id, data]); },
        ...over,
    };
    const removeStoredFiles = async (paths) => { calls.push(['remove', paths]); };
    return { svc: createUserService({ userRepository, removeStoredFiles }), calls };
}

test('profile pic: DB is updated first, then the old file is removed, the new one is kept', async () => {
    const { svc, calls } = build({ profilePicPath: '/uploads/profile/old.png' });
    const url = await svc.uploadProfilePic('u1', file('/uploads/profile/new.png'));
    assert.equal(url, '/uploads/profile/new.png');
    assert.deepEqual(calls, [
        ['update', 'u1', { profilePicPath: '/uploads/profile/new.png' }],
        ['remove', ['/uploads/profile/old.png']],
    ]);
});

test('first upload: nothing to remove', async () => {
    const { svc, calls } = build({});
    await svc.uploadProfilePic('u1', file('/uploads/profile/new.png'));
    assert.equal(calls.some(([op]) => op === 'remove'), false);
});

test('a failing DB update removes the NEW file and keeps the old one', async () => {
    const { svc, calls } = build({ profilePicPath: '/uploads/profile/old.png' }, {
        updateUserById: async () => { throw new Error('db down'); },
    });
    await assert.rejects(() => svc.uploadProfilePic('u1', file('/uploads/profile/new.png')), /db down/);
    assert.deepEqual(calls, [['remove', ['/uploads/profile/new.png']]]);
});

test('unknown user -> 404 and the uploaded file is removed', async () => {
    const { svc, calls } = build(null);
    await assert.rejects(() => svc.uploadProfilePic('u1', file('/uploads/profile/new.png')), (e) => e.statusCode === 404);
    assert.deepEqual(calls, [['remove', ['/uploads/profile/new.png']]]);
});

test('cv is stored in cvPath', async () => {
    const { svc, calls } = build({ cvPath: '/uploads/cv/old.pdf' });
    await svc.uploadCv('u1', file('/uploads/cv/new.pdf'));
    assert.deepEqual(calls[0], ['update', 'u1', { cvPath: '/uploads/cv/new.pdf' }]);
    assert.deepEqual(calls[1], ['remove', ['/uploads/cv/old.pdf']]);
});

test('cover images: the whole set is replaced and all old files are removed', async () => {
    const { svc, calls } = build({ coverImagePaths: ['/uploads/covers/a.png', '/uploads/covers/b.png'] });
    const urls = await svc.uploadCoverImages('u1', [file('/uploads/covers/c.png'), file('/uploads/covers/d.png')]);
    assert.deepEqual(urls, ['/uploads/covers/c.png', '/uploads/covers/d.png']);
    assert.deepEqual(calls[0], ['update', 'u1', { coverImagePaths: urls }]);
    assert.deepEqual(calls[1], ['remove', ['/uploads/covers/a.png', '/uploads/covers/b.png']]);
});

let User;
before(async () => {
    mongoose.set('autoCreate', false);
    mongoose.set('autoIndex', false);
    ({ User } = await import('../../src/app/user/model/user.model.js'));
});

test('model: coverImagePaths is an array of strings', () => {
    assert.equal(User.schema.path('coverImagePaths').instance, 'Array');
});