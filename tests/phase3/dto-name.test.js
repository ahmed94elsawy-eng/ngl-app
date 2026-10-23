import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerDTO, verifyAccountDTO, resetPasswordDTO, sendOTPDto } from '../../src/app/auth/dto/auth.dto.js';
import { toValidName } from '../../src/app/auth/utils/name.js';

const valid = { email: 'A@X.com', name: 'Ahmed', password: '12345678' };

test('register: dob as a JSON string is accepted and becomes a Date', () => {
    const r = registerDTO.safeParse({ ...valid, dob: '2000-05-20' });
    assert.equal(r.success, true);
    assert.ok(r.data.dob instanceof Date);
});

test('register: dob is optional, an invalid dob is rejected', () => {
    assert.equal(registerDTO.safeParse(valid).success, true);
    assert.equal(registerDTO.safeParse({ ...valid, dob: 'not a date' }).success, false);
});

test('register: email is lowercased, name needs 3..20 chars', () => {
    assert.equal(registerDTO.parse(valid).email, 'a@x.com');
    assert.equal(registerDTO.safeParse({ ...valid, name: 'Al' }).success, false);
    assert.equal(registerDTO.safeParse({ ...valid, name: 'a'.repeat(21) }).success, false);
});

test('codes must be exactly 6 digits (spaces around are trimmed)', () => {
    const ok = (code) => verifyAccountDTO.safeParse({ email: 'a@x.com', code }).success;
    assert.equal(ok('123456'), true);
    assert.equal(ok(' 123456 '), true);
    assert.equal(ok('12345a'), false);
    assert.equal(ok('12345'), false);
    assert.equal(ok('1234567'), false);
    const r = resetPasswordDTO.safeParse({ email: 'a@x.com', code: 'abcdef', newPassword: '12345678' });
    assert.equal(r.success, false);
});

test('send-otp only needs an email', () => {
    assert.equal(sendOTPDto.safeParse({ email: 'a@x.com' }).success, true);
    assert.equal(sendOTPDto.safeParse({}).success, false);
});

test('toValidName keeps a good name, collapses spaces', () => {
    assert.equal(toValidName('  Ahmed   Ali ', 'a@x.com'), 'Ahmed Ali');
});

test('toValidName truncates long names to 20 chars without trailing space', () => {
    const n = toValidName('Muhammad Abdelrahman Hassan Ibrahim', 'a@x.com');
    assert.ok(n.length <= 20);
    assert.equal(n, n.trim());
});

test('toValidName falls back to the email when the name is missing or too short', () => {
    assert.equal(toValidName(undefined, 'sara.k@x.com'), 'sara.k');
    assert.equal(toValidName('Al', 'sara@x.com'), 'sara');
    assert.equal(toValidName(null, 'a@x.com'), 'auser');
});

test('toValidName always returns 3..20 chars', () => {
    for (const [name, email] of [['', 'a@x.com'], ['x', 'b@x.com'], ['  ', 'zz@x.com'], ['a'.repeat(50), 'q@x.com']]) {
        const n = toValidName(name, email);
        assert.ok(n.length >= 3 && n.length <= 20, `bad length for "${name}": "${n}"`);
    }
});