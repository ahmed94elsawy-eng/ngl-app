
import dns from 'dns';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { logger } from '../../pkg/logger/logger.js';

// explicit connect: no side effects on import, so app.js can be loaded in tests
export async function connectDB() {
  if (env.nodeEnv === 'development') {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
  await mongoose.connect(env.db.url);
  logger.info('MongoDB connected');
}