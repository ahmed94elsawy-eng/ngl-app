import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { sendMessageDto, listMessagesDto, messageIdDto } from '../../src/app/message/dto/message.dto.js';
import { CONTENT_MAX } from '../../src/app/message/message.constants.js';

const ID = 'a1'.repeat(12);

test('send: content is trimmed and limited to 1..200 (same as the model)', () => {
    assert.equal(sendMessageDto.parse({ content: '  hi  ', receiver: ID }).content, 'hi');
    assert.equal(sendMessageDto.safeParse({ content: 'x', receiver: ID }).success, true);
    assert.equal(sendMessageDto.safeParse({ content: 'x'.repeat(CONTENT_MAX), receiver: ID }).success, true);
    assert.equal(sendMessageDto.safeParse({ content: 'x'.repeat(CONTENT_MAX + 1), receiver: ID }).success, false);
    assert.equal(sendMessageDto.safeParse({ content: '   ', receiver: ID }).success, false);
});

test('send: receiver must be exactly 24 hex characters', () => {
    assert.equal(sendMessageDto.safeParse({ content: 'hi', receiver: 'abcdefghijkl' }).success, false); // 12 chars
    assert.equal(sendMessageDto.safeParse({ content: 'hi', receiver: 'z'.repeat(24) }).success, false);
    assert.equal(sendMessageDto.safeParse({ content: 'hi', receiver: { $ne: null } }).success, false);
});

test('list: defaults, string coercion and bounds', () => {
    assert.deepEqual(listMessagesDto.parse({}), { page: 1, limit: 20 });
    assert.deepEqual(listMessagesDto.parse({ page: '2', limit: '10' }), { page: 2, limit: 10 });
    for (const bad of [{ page: '0' }, { page: '-1' }, { limit: '0' }, { limit: '51' }, { limit: '1000000' }, { page: 'abc' }, { page: '1.5' }]) {
        assert.equal(listMessagesDto.safeParse(bad).success, false, JSON.stringify(bad));
    }
});

test('id param must be a 24 hex ObjectId', () => {
    assert.equal(messageIdDto.safeParse({ id: ID }).success, true);
    assert.equal(messageIdDto.safeParse({ id: 'public' }).success, false);
    assert.equal(messageIdDto.safeParse({}).success, false);
});

let Message;
before(async () => {
    // no DB in this test: don't try to create collections/indexes
    mongoose.set('autoCreate', false);
    mongoose.set('autoIndex', false);
    ({ Message } = await import('../../src/app/message/model/message.model.js'));
});

test('model: sender is never selected by default', () => {
    assert.equal(Message.schema.path('sender').options.select, false);
});

test('model: content length matches the DTO', () => {
    assert.equal(Message.schema.path('content').options.maxlength, CONTENT_MAX);
    assert.equal(Message.schema.path('content').options.minlength, 1);
});

test('model: the inbox index starts with receiver', () => {
    const indexes = Message.schema.indexes();
    const inbox = indexes.find(([fields]) => 'receiver' in fields);
    assert.ok(inbox, 'no index on receiver');
    assert.deepEqual(Object.keys(inbox[0]), ['receiver', 'isDeleted', 'createdAt', '_id']);
});