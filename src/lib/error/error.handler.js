

import { logger } from "../../pkg/logger/logger.js";

// maps any thrown error to { status, message } (pure function, easy to test)
export function resolveError(err){
    const name = err?.name;

    // our own errors (AppError)
    if (err?.isOperational === true) {
        return {
            status: Number.isInteger(err.statusCode) ? err.statusCode : 500,
            message: err.message
        };
    }
    // jsonwebtoken
    if (name === 'TokenExpiredError') return { status: 401, message: 'token expired' };
    if (name === 'JsonWebTokenError' || name === 'NotBeforeError') return { status: 401, message: 'invalid token' };
    // zod
    if (name === 'ZodError') {
        const issues = err.issues ?? [];
        return { status: 400, message: issues.map(i => `${i.path?.[0] ?? 'error'}: ${i.message}`).join(', ') || 'invalid data' };
    }
    // multer
    if (name === 'MulterError') {
        return { status: err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, message: err.message };
    }
    // express.json() errors
    if (err?.type === 'entity.parse.failed') return { status: 400, message: 'invalid JSON body' };
    if (err?.type === 'entity.too.large') return { status: 413, message: 'request body too large' };
    // mongoose / mongodb
    if (name === 'ValidationError' && err.errors) {
        return { status: 400, message: Object.values(err.errors).map(e => e.message).join(', ') };
    }
    if (name === 'CastError') return { status: 400, message: 'invalid value' };
    if (err?.code === 11000) return { status: 409, message: 'already exists' };

    // anything else: never leak details
    return { status: 500, message: 'Something went wrong' };
}

export function notFoundHandler(req, res){
    res.status(404).json({ message: 'Route not found', success: false });
}

export function globalErrorHandler(err, req, res, next){
    const { status, message } = resolveError(err);

    if (status >= 500) {
        logger.error(err?.message ?? 'unknown error', { stack: err?.stack, correlationId: req.correlationId });
    } else {
        logger.info(message, { status, correlationId: req.correlationId });
    }

    // response already started: let Express close the connection
    if (res.headersSent) return next(err);

    return res.status(status).json({
        message,
        success: false,
        correlationId: req.correlationId
    });
}