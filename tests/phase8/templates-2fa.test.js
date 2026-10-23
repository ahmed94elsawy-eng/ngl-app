import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderOtpEmail } from '../../src/lib/email/templates.js';

test('two-step verification emails have their own subject and text', () => {
    const enable = renderOtpEmail({ purpose: 'enable2fa', code: '123456' });
    const login = renderOtpEmail({ purpose: 'login2fa', code: '654321' });
    assert.match(enable.subject, /two-step/);
    assert.match(enable.html, />\s*123456\s*</);
    assert.match(login.subject, /login code/);
    assert.match(login.html, /Confirm your login/);
    assert.notEqual(enable.subject, login.subject);
});