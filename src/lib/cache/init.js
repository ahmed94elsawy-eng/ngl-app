import { RedisCacheProvider } from "../../pkg/cache/redis.js";
import { env } from "../config/env.js";

export const cacheProvider = new RedisCacheProvider({
    url: env.redis.uri,
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    keyPrefix: env.redis.keyPrefix
});
