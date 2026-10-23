import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../src/lib/error/error.js';
import { resolveError, globalErrorHandler, notFoundHandler } from '../../src/lib/error/error.handler.js';

const named = (name, extra = {}) => Object.assign(new Error('x'), { name }, extra);

test('AppError keeps its status and message', () => {
    assert.deepEqual(resolveError(new AppError('nope', 404)), { status: 404, message: 'nope' });
});

test('AppError without a status becomes 500 instead of crashing', () => {
    assert.equal(resolveError(new AppError('no status')).status, 500);
});

test('jwt errors become 401', () => {
    assert.equal(resolveError(named('TokenExpiredError')).status, 401);
    assert.equal(resolveError(named('JsonWebTokenError')).status, 401);
    assert.equal(resolveError(named('NotBeforeError')).status, 401);
});

test('zod error becomes 400 with readable message', () => {
    const e = named('ZodError', { issues: [{ path: ['email'], message: 'bad' }] });
    assert.deepEqual(resolveError(e), { status: 400, message: 'email: bad' });
});

test('multer errors: size limit 413, others 400', () => {
    assert.equal(resolveError(named('MulterError', { code: 'LIMIT_FILE_SIZE' })).status, 413);
    assert.equal(resolveError(named('MulterError', { code: 'LIMIT_UNEXPECTED_FILE' })).status, 400);
});

test('malformed JSON body becomes 400', () => {
    assert.equal(resolveError(named('SyntaxError', { type: 'entity.parse.failed' })).status, 400);
});

test('mongoose validation 400, cast 400, duplicate key 409', () => {
    assert.equal(resolveError(named('ValidationError', { errors: { a: { message: 'm' } } })).status, 400);
    assert.equal(resolveError(named('CastError')).status, 400);
    assert.equal(resolveError(Object.assign(new Error('dup'), { code: 11000 })).status, 409);
});

test('unknown error is 500 and does not leak its message', () => {
    assert.deepEqual(resolveError(new Error('secret db detail')), { status: 500, message: 'Something went wrong' });
});

function makeRes(headersSent = false) {
    return {
        headersSent, statusCode: undefined, body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
}

test('handler returns a uniform body with correlationId', () => {
    const res = makeRes();
    globalErrorHandler(new AppError('bad', 400), { correlationId: 'abc' }, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: 'bad', success: false, correlationId: 'abc' });
});

test('handler delegates to next when headers were already sent', () => {
    const res = makeRes(true);
    let nextArg;
    const err = new Error('late');
    globalErrorHandler(err, {}, res, (e) => { nextArg = e; });
    assert.equal(nextArg, err);
    assert.equal(res.statusCode, undefined);
});

test('notFoundHandler answers 404 JSON', () => {
    const res = makeRes();
    notFoundHandler({}, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
});