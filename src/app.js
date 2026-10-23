import express from 'express'
import path from 'node:path';
import cookieParser from 'cookie-parser'
import { globalErrorHandler, notFoundHandler } from './lib/error/error.handler.js';
import { router } from './route.js';
import { correlationId } from './lib/correlation/correlationid.js';
import { securityMiddleware } from './lib/http/security.js';
import { env } from './lib/config/env.js';

export function createApp(){

   const app = express();

// behind a reverse proxy / load balancer req.ip would be the proxy's IP (every user would share one rate limit)
if (env.trustProxyHops > 0) app.set('trust proxy', env.trustProxyHops);

// first, so every log and error response has a correlation id
app.use(correlationId)

app.use(...securityMiddleware(env.origins));

// Serve only intentionally public image uploads. CVs are private and must use
// the authenticated /api/user/cv endpoint instead of a public static URL.
const uploadsRoot = path.resolve(process.cwd(), 'uploads');
const publicImageOptions = { dotfiles: 'deny', index: false, maxAge: env.nodeEnv === 'production' ? '7d' : 0 };
app.use('/uploads/profile', express.static(path.resolve(uploadsRoot, 'profile'), publicImageOptions));
app.use('/uploads/covers', express.static(path.resolve(uploadsRoot, 'covers'), publicImageOptions));
// parse incoming requests buffer to object
app.use(express.json());

// parsing cookies
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.json('OK')
})

// routes navigate to features
app.use('/api', router)

// unknown routes
app.use(notFoundHandler)

// global error handler
app.use(globalErrorHandler)

  return app

}