import { cacheProvider } from "../cache/init.js";
import { createIdempotency } from "./idempotency.core.js";

// usage: idempotency({ required: true, ttl: 3600 })
export const idempotency = createIdempotency(cacheProvider);