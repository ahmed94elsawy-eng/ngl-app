import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../../../lib/config/env.js';

export function generateToken(payload){
    return jwt.sign(
            payload,
            env.jwt.secret,
            {
                algorithm: 'HS256',
                expiresIn: env.jwt.expiresInSeconds, // seconds (the old toMs(1,'hours') meant ~41 days)
                jwtid: crypto.randomUUID()           // lets us revoke this single token on logout
            }
        );
}