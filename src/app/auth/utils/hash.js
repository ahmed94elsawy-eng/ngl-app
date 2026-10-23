import bcrypt from "bcrypt"
import { AppError } from "../../../lib/error/error.js";

const ROUNDS = 12;

export async function hashPassword(password) {
    // bcrypt silently ignores everything after 72 bytes
    if (Buffer.byteLength(password, 'utf8') > 72) {
        throw new AppError('password is too long', 400);
    }
    return bcrypt.hash(password, ROUNDS);
}

// old hashes (cost 10) still verify, the cost is stored inside the hash
export async function comparePassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
}