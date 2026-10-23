import { OAuth2Client } from "google-auth-library";
import { AppError } from "../error/error.js";
import { env } from "../config/env.js";

// factory so it can be tested without calling Google
export function createGoogleVerifier({ client, audience }) {
    return async function verifyGoogleToken(idToken) {
        if (typeof idToken !== 'string' || idToken.length === 0) {
            throw new AppError('idToken is required', 400);
        }

        let payload;
        try {
            const ticket = await client.verifyIdToken({ idToken, audience });
            payload = ticket.getPayload();
        } catch (err) {
            throw new AppError('invalid google token', 401);
        }

        // without this anyone could sign in as an email Google never verified
        if (!payload?.email || payload.email_verified !== true) {
            throw new AppError('google email is not verified', 401);
        }
        return payload;
    };
}

export const verifyGoogleToken = createGoogleVerifier({
    client: new OAuth2Client(),
    audience: [env.google.webClientId, env.google.iosClientId],
});