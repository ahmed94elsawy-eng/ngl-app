import { AppError } from "../error/error.js";

export function createAuthGuard({ verifyToken, findUserById, isRevoked }){
    return async function authGuard(req, res, next){
        try {
            const token = req.cookies?.access_token;
            if (!token) throw new AppError('no token provided', 401);

            // throws jwt errors (expired / invalid) -> the error handler maps them to 401
            const payload = verifyToken(token);

            // old tokens (issued before this phase) have no jti, they skip this check
            if (payload.jti && await isRevoked(payload.jti)) {
                throw new AppError('token revoked', 401);
            }

            const user = await findUserById(payload.id);
            if (!user) throw new AppError('user not found', 401);

            // password reset / logout-all invalidates every token issued before it
            const changedAt = user.changeCredentialsTime
                ? Math.floor(user.changeCredentialsTime.getTime() / 1000)
                : 0;
            if (changedAt >= payload.iat) {
                throw new AppError('session expired, please login again', 401);
            }

            req.user = payload; // { id, name, jti, iat, exp }
            next();
        } catch (error) {
            next(error);
        }
    };
}