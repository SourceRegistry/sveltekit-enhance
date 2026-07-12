import type {EnhanceInput, EnhanceResponseHandler, MaybePromise} from "../index.js";
import {ClientIp} from "./internal/client_ip.js";
import type {Logger} from "./internal/logger.js";

export type RateLimitRule<RuleId extends string = string> = {
    id: RuleId;
    pattern: RegExp;
    methods?: ReadonlySet<string> | ReadonlyArray<string>;
    limit: number;
    windowMs: number;
};

type Bucket = {
    count: number;
    resetAt: number;
};

export type RateLimitStore = {
    /**
     * Increment key's counter for current window, creating it if absent/expired.
     * Return counter state after increment.
     */
    increment(key: string, windowMs: number, now: number): MaybePromise<Bucket>;
};

export type MemoryRateLimitStoreOptions = {
    cleanupIntervalMs?: number;
};

/**
 * Single-process, in-memory store. Fine for one instance; buckets aren't
 * shared across processes/machines, so a multi-instance deployment (eg.
 * serverless, multiple pods) under-counts unless a shared store (Redis, etc.)
 * is supplied via `RequestRateLimitOptions.store` instead.
 */
export const createMemoryRateLimitStore = (options: MemoryRateLimitStoreOptions = {}): RateLimitStore => {
    const buckets = new Map<string, Bucket>();

    const cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of buckets.entries()) {
            if (bucket.resetAt <= now) buckets.delete(key);
        }
    }, options.cleanupIntervalMs ?? 30_000);
    cleanupTimer.unref?.();

    return {
        increment(key, windowMs, now) {
            const previous = buckets.get(key);
            const bucket =
                !previous || previous.resetAt <= now
                    ? {count: 0, resetAt: now + windowMs}
                    : previous;

            bucket.count += 1;
            buckets.set(key, bucket);
            return bucket;
        }
    };
};

const defaultStore = createMemoryRateLimitStore();

const includes = <T>(input: { [Symbol.iterator](): IteratorObject<T> }, element: T) => {
    return input[Symbol.iterator]().find((v) => v === element)
}

const findRule = <RuleId extends string>(
    rules: RateLimitRule<RuleId>[],
    method: string,
    pathname: string
) =>
    rules.find(
        (rule) =>
            rule.pattern.test(pathname) && (!rule.methods || includes(rule.methods, method.toUpperCase()))
    );

const getClientIdentifier = (input: EnhanceInput<'handle'>) => {
    try {
        const address = input.getClientAddress?.();
        if (address) return address;
    } catch {
        // adapter may not support getClientAddress (eg. prerendering); fall through
    }
    return ClientIp().fromRequest(input.request) ?? 'unknown';
};

const decorateRateLimitHeaders = (
    response: Response,
    input: {
        limit: number;
        remaining: number;
        resetAt: number;
        windowMs: number;
        correlationId?: string;
        correlationHeader?: string;
    }
) => {
    const setHeaders = (headers: Headers) => {
        headers.set('x-ratelimit-limit', String(input.limit));
        headers.set('x-ratelimit-remaining', String(Math.max(input.remaining, 0)));
        headers.set('x-ratelimit-reset', String(Math.ceil(input.resetAt / 1000)));
        headers.set('x-ratelimit-policy', `${input.limit};w=${Math.ceil(input.windowMs / 1000)}`);
        if (input.correlationId) headers.set(input.correlationHeader ?? 'x-correlation-id', input.correlationId);
    };

    try {
        setHeaders(response.headers);
        return response;
    } catch {
        const headers = new Headers(response.headers);
        setHeaders(headers);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
        });
    }
};


export type RequestRateLimitOptions<RuleId extends string> = {
    enabled?: boolean;
    rules: RateLimitRule<RuleId>[];
    correlationHeader?: string;
    correlationId?: (input: EnhanceInput<'handle'>) => string | undefined;
    clientIdentifier?: (input: EnhanceInput<'handle'>) => string;
    /**
     * Bucket storage backend. Defaults to a single-process in-memory store.
     * Pass a shared store (eg. Redis-backed) when running multiple
     * instances/processes so limits are enforced consistently across them.
     */
    store?: RateLimitStore;
    logger?: Logger;

};

export const RequestRateLimit = ({
    inspect: <RuleId extends string>(
        options: RequestRateLimitOptions<RuleId>
    ) => async (input: EnhanceInput<'handle'>) => {
        if (options.enabled === false) return;
        const method = input.request.method.toUpperCase();
        const pathname = input.url.pathname;
        const rule = findRule(options.rules, method, pathname);
        if (!rule) return;
        if (rule.limit <= 0 || rule.windowMs <= 0) return;

        const now = Date.now();
        const client = options.clientIdentifier?.(input) ?? getClientIdentifier(input);
        const key = `${rule.id}:${client}`;
        const correlationId = options.correlationId?.(input) ?? (input.locals as App.Locals & {
            correlation_id?: string
        }).correlation_id;

        const store = options.store ?? defaultStore;
        const bucket = await store.increment(key, rule.windowMs, now);

        const remaining = rule.limit - bucket.count;
        const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

        if (bucket.count > rule.limit) {
            options?.logger?.warn('request.rate_limited', {
                correlationId,
                rule: rule.id,
                method,
                path: pathname,
                client,
                limit: rule.limit,
                windowMs: rule.windowMs,
                retryAfterSeconds
            });

            const headers = new Headers({
                'content-type': 'application/json',
                'retry-after': String(retryAfterSeconds),
                'x-ratelimit-limit': String(rule.limit),
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(Math.ceil(bucket.resetAt / 1000)),
                'x-ratelimit-policy': `${rule.limit};w=${Math.ceil(rule.windowMs / 1000)}`
            });
            if (correlationId) headers.set(options.correlationHeader ?? 'x-correlation-id', correlationId);

            throw new Response(
                JSON.stringify({
                    message: 'Too many requests. Please retry later.'
                }),
                {
                    status: 429,
                    headers
                }
            );
        }

        const respond: EnhanceResponseHandler = ({response}) =>
            decorateRateLimitHeaders(response, {
                limit: rule.limit,
                remaining,
                resetAt: bucket.resetAt,
                windowMs: rule.windowMs,
                correlationId,
                correlationHeader: options.correlationHeader
            });
        input.responseHandlers.push(respond);
    }
});

