import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { findUserById } from "../../app/user/repository/user.repository.js";
import { isRevoked } from "./revocation.js";
import { createAuthGuard } from "./guard.core.js";

export const authGuard = createAuthGuard({
    verifyToken: (token) => jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] }),
    findUserById,
    isRevoked,
});