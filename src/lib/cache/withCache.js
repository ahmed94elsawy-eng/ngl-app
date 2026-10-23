
import { cacheProvider } from "./init.js";
import { createWithCache } from "./withCache.core.js";

export const withCache = createWithCache(cacheProvider);