import { cacheProvider } from "../../../lib/cache/init.js";
import { logger } from "../../../pkg/logger/logger.js";
import { createLoginLock } from "./loginLock.core.js";

export const loginLock = createLoginLock({ cache: cacheProvider, logger });