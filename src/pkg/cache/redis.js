import { Redis } from 'ioredis';

export class RedisCacheProvider {
    client;

    constructor(config) {
        const commonOptions = {
            lazyConnect: true,
            maxLoadingRetryTime: 3,
            keyPrefix: config.keyPrefix || ''
        };

        // A redis:// or rediss:// URI lets managed providers supply their own
        // username, password, port, and TLS configuration in one value.
        this.client = config.url
            ? new Redis(config.url, commonOptions)
            : new Redis({
                ...commonOptions,
                host: config.host,
                port: config.port,
                password: config.password || undefined
            });

        this.client.on('error', (err) => console.log('redis server error:', err.message));
        this.client.connect().catch((err) => console.log('fail to connect to redis', err.message));
    }

    async set(key, value, ttl) {
        if (ttl === undefined) return await this.client.set(key, value);
        return await this.client.set(key, value, 'EX', ttl);
    }

    async setIfAbsent(key, value, ttl) {
        const res = await this.client.set(key, value, 'EX', ttl, 'NX');
        return res === 'OK';
    }

    async get(key) {
        return await this.client.get(key);
    }

    async del(key) {
        return await this.client.del(key);
    }

    async incr(key) {
        return await this.client.incr(key);
    }

    async decr(key) {
        return await this.client.decr(key);
    }

    async expire(key, seconds) {
        return await this.client.expire(key, seconds);
    }

    async ttl(key) {
        return await this.client.ttl(key);
    }

    async exists(key) {
        return (await this.client.exists(key)) === 1;
    }
}
