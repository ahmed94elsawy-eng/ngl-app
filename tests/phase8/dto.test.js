import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginConfirmDTO, twoFactorConfirmDTO } from '../../src/app/auth/dto/auth.dto.js';
import { createRequestDto, listReceivedDto } from '../../src/app/identity-request/dto/identity-request.dto.js';
import { sendMessageDto } from '../../src/app/conversation/dto/conversation.dto.js';

const ID = 'a1'.repeat(12);

test('login confirmation needs an email and a 6 digit code', () => {
    assert.equal(loginConfirmDTO.safeParse({ email: 'A@X.com', code: '123456' }).data.email, 'a@x.com');
    assert.equal(loginConfirmDTO.safeParse({ email: 'a@x.com', code: '12345' }).success, false);
    assert.equal(loginConfirmDTO.safeParse({ email: 'a@x.com' }).success, false);
    assert.equal(twoFactorConfirmDTO.safeParse({ code: 'abcdef' }).success, false);
    assert.equal(twoFactorConfirmDTO.safeParse({ code: '123456' }).success, true);
});

test('identity request: messageId must be a 24 hex id', () => {
    assert.equal(createRequestDto.safeParse({ messageId: ID }).success, true);
    assert.equal(createRequestDto.safeParse({ messageId: 'abc' }).success, false);
    assert.equal(createRequestDto.safeParse({ messageId: { $ne: null } }).success, false);
});

test('received list: status filter and pagination bounds', () => {
    assert.deepEqual(listReceivedDto.parse({}), { page: 1, limit: 20 });
    assert.equal(listReceivedDto.safeParse({ status: 'pending' }).success, true);
    assert.equal(listReceivedDto.safeParse({ status: 'hacked' }).success, false);
    assert.equal(listReceivedDto.safeParse({ limit: '1000' }).success, false);
});

test('conversation message: trimmed, 1..1000 characters', () => {
    assert.equal(sendMessageDto.parse({ content: '  hi ' }).content, 'hi');
    assert.equal(sendMessageDto.safeParse({ content: '   ' }).success, false);
    assert.equal(sendMessageDto.safeParse({ content: 'x'.repeat(1001) }).success, false);
});