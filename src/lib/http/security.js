import helmet from 'helmet';
import cors from 'cors';

export function securityMiddleware(origins) {
    return [
        // The frontend may load public images from the uploads route.
        helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }),
        // A comma-separated ORIGINS value is normalized to an exact origin allowlist.
        // credentials: true is required for the access_token cookie to be sent.
        cors({ origin: origins, credentials: true }),
    ];
}
