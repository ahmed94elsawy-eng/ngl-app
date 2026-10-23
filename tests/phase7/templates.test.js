import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderOtpEmail } from '../../src/lib/email/templates.js';

test('verify email: NGL branding, the code and the expiry are inside', () => {
    const { subject, html } = renderOtpEmail({ purpose: 'verify', code: '123456' });
    assert.match(subject, /NGL/);
    assert.match(html, />\s*123456\s*</);
    assert.match(html, /NGL/);
    assert.match(html, /expires in 3 minutes/);
});

test('verify and reset use different subjects and texts', () => {
    const v = renderOtpEmail({ purpose: 'verify', code: '111111' });
    const r = renderOtpEmail({ purpose: 'reset', code: '111111' });
    assert.notEqual(v.subject, r.subject);
    assert.match(v.html, /Verify your email/);
    assert.match(r.html, /Reset your password/);
    assert.doesNotMatch(r.html, /Verify your email/);
});

test('no old branding and no external resources', () => {
    for (const purpose of ['verify', 'reset']) {
        const { html } = renderOtpEmail({ purpose, code: '123456' });
        assert.doesNotMatch(html, /LINK-iT|icons8|example\.com/i);
        assert.doesNotMatch(html, /https?:\/\//);
    }
});

test('values are HTML-escaped', () => {
    const { html } = renderOtpEmail({ purpose: 'verify', code: '<script>alert(1)</script>' });
    assert.equal(html.includes('<script>'), false);
    assert.match(html, /&lt;script&gt;/);
});

test('an unknown purpose is an error, not an empty email', () => {
    assert.throws(() => renderOtpEmail({ purpose: 'nope', code: '123456' }), /invalid email purpose/);
});

test('expiry text can be changed', () => {
    assert.match(renderOtpEmail({ purpose: 'verify', code: '1', expiresInMinutes: 10 }).html, /expires in 10 minutes/);
});