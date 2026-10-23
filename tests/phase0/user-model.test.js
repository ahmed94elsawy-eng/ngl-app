import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

let User;

before(async () => {
    // no DB in this test: don't try to create collections/indexes
    mongoose.set('autoCreate', false);
    mongoose.set('autoIndex', false);
    ({ User } = await import('../../src/app/user/model/user.model.js'));
});

test('password is excluded from queries by default', () => {
    assert.equal(User.schema.path('password').options.select, false);
});

test('toJSON never contains the password hash', () => {
    const user = new User({ name: 'Ahmed', email: 'a@b.com', password: 'hashed-value' });
    const json = user.toJSON();
    assert.equal('password' in json, false);
    assert.equal(json.email, 'a@b.com');
});

test('password is still required for local provider', () => {
    const user = new User({ name: 'Ahmed', email: 'a@b.com' });
    const err = user.validateSync();
    assert.ok(err?.errors?.password);
});

test('google user does not need a password', () => {
    const user = new User({ name: 'Ahmed', email: 'a@b.com', provider: 'google' });
    assert.equal(user.validateSync(), undefined);
});