import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { securityMiddleware } from '../../src/lib/http/security.js';
import { globalErrorHandler, notFoundHandler } from '../../src/lib/error/error.handler.js';
import { correlationId } from '../../src/lib/correlation/correlationid.js';

let server, base;
const ORIGIN = 'http://localhost:4200';

before(async () => {
    const app = express();
    app.use(correlationId);
    app.use(...securityMiddleware(ORIGIN));
    app.use(express.json());
    app.post('/echo', (req, res) => res.json(req.body));
    app.get('/boom', () => { throw new Error('secret detail'); });
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    await new Promise((r) => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => server.close(r)));

test('helmet headers are present', async () => {
    const res = await fetch(`${base}/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
});

test('CORS allows the frontend origin with credentials', async () => {
    const res = await fetch(`${base}/echo`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
});

test('unknown route returns 404 JSON', async () => {
    const res = await fetch(`${base}/nothing`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
});

test('malformed JSON returns 400 JSON, not 500', async () => {
    const res = await fetch(`${base}/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).success, false);
});

test('unexpected error returns generic 500 and a correlation id', async () => {
    const res = await fetch(`${base}/boom`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.message, 'Something went wrong');
    assert.ok(body.correlationId);
    assert.equal(res.headers.get('x-correlation-id'), body.correlationId);
});