import crypto from 'node:crypto';

export function generateOTPCode() {
    // the upper bound is exclusive: 100000..999999
    return crypto.randomInt(100000, 1000000).toString();
}