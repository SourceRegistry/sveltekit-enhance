import {describe, expect, it, vi} from 'vitest';
import {createMemoryRateLimitStore, RequestRateLimit, type RateLimitStore} from './request-rate-limit.js';

const createInput = (overrides: {
    method?: string;
    pathname?: string;
    headers?: Record<string, string>;
    locals?: Record<string, unknown>;
    getClientAddress?: () => string;
} = {}) => {
    const responseHandlers: Array<({response}: { response: Response }) => unknown> = [];
    const url = new URL(`http://localhost${overrides.pathname ?? '/api/thing'}`);
    const input = {
        request: new Request(url, {
            method: overrides.method ?? 'GET',
            headers: overrides.headers
        }),
        url,
        locals: overrides.locals ?? {},
        responseHandlers,
        getClientAddress: overrides.getClientAddress
    } as any;
    return {input, responseHandlers};
};

describe('RequestRateLimit', () => {
    it('allows requests under the limit and decorates response headers', async () => {
        const guard = RequestRateLimit.inspect({
            rules: [{id: 'default', pattern: /^\/api\//, limit: 2, windowMs: 60_000}],
            store: createMemoryRateLimitStore()
        });

        const {input, responseHandlers} = createInput();
        await guard(input);
        expect(responseHandlers).toHaveLength(1);

        const response = new Response('ok');
        const decorated = await responseHandlers[0]({response}) as Response;
        expect(decorated.headers.get('x-ratelimit-limit')).toBe('2');
        expect(decorated.headers.get('x-ratelimit-remaining')).toBe('1');
        expect(decorated.headers.get('x-ratelimit-policy')).toBe('2;w=60');
    });

    it('throws a 429 response once the limit is exceeded', async () => {
        const guard = RequestRateLimit.inspect({
            rules: [{id: 'default', pattern: /^\/api\//, limit: 1, windowMs: 60_000}],
            store: createMemoryRateLimitStore()
        });

        await guard(createInput().input);

        const {input} = createInput();
        await expect(guard(input)).rejects.toBeInstanceOf(Response);

        try {
            await guard(createInput().input);
            expect.unreachable();
        } catch (response) {
            expect((response as Response).status).toBe(429);
            expect((response as Response).headers.get('retry-after')).toBeTruthy();
            expect((response as Response).headers.get('x-ratelimit-remaining')).toBe('0');
        }
    });

    it('ignores requests that do not match any rule', async () => {
        const guard = RequestRateLimit.inspect({
            rules: [{id: 'default', pattern: /^\/only-this\//, limit: 1, windowMs: 60_000}],
            store: createMemoryRateLimitStore()
        });

        const {input, responseHandlers} = createInput({pathname: '/other'});
        await guard(input);
        expect(responseHandlers).toHaveLength(0);
    });

    it('filters rules by method', async () => {
        const guard = RequestRateLimit.inspect({
            rules: [{id: 'writes', pattern: /^\/api\//, methods: ['POST'], limit: 1, windowMs: 60_000}],
            store: createMemoryRateLimitStore()
        });

        const {input: getInput, responseHandlers: getHandlers} = createInput({method: 'GET'});
        await guard(getInput);
        expect(getHandlers).toHaveLength(0);

        const {input: postInput, responseHandlers: postHandlers} = createInput({method: 'POST'});
        await guard(postInput);
        expect(postHandlers).toHaveLength(1);
    });

    it('does nothing when disabled', async () => {
        const guard = RequestRateLimit.inspect({
            enabled: false,
            rules: [{id: 'default', pattern: /^\/api\//, limit: 1, windowMs: 60_000}]
        });

        const {input, responseHandlers} = createInput();
        await guard(input);
        expect(responseHandlers).toHaveLength(0);
    });

    it('tracks separate buckets per client identifier', async () => {
        const guard = RequestRateLimit.inspect({
            rules: [{id: 'default', pattern: /^\/api\//, limit: 1, windowMs: 60_000}],
            clientIdentifier: (input) => input.request.headers.get('x-client') ?? 'anon',
            store: createMemoryRateLimitStore()
        });

        const {input: clientA} = createInput({headers: {'x-client': 'a'}});
        const {input: clientB} = createInput({headers: {'x-client': 'b'}});

        await guard(clientA);
        await guard(clientB);
        await expect(guard(createInput({headers: {'x-client': 'a'}}).input)).rejects.toBeInstanceOf(Response);
    });

    it('uses correlationHeader for both success and rejection responses', async () => {
        const guard = RequestRateLimit.inspect({
            rules: [{id: 'default', pattern: /^\/api\//, limit: 1, windowMs: 60_000}],
            correlationHeader: 'x-trace-id',
            correlationId: () => 'trace-abc',
            store: createMemoryRateLimitStore()
        });

        const {input, responseHandlers} = createInput();
        await guard(input);
        const decorated = await responseHandlers[0]({response: new Response('ok')}) as Response;
        expect(decorated.headers.get('x-trace-id')).toBe('trace-abc');

        try {
            await guard(createInput().input);
            expect.unreachable();
        } catch (response) {
            expect((response as Response).headers.get('x-trace-id')).toBe('trace-abc');
        }
    });

    it('logs a warning when a request is rate limited', async () => {
        const logger = {warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn()} as any;
        const guard = RequestRateLimit.inspect({
            rules: [{id: 'default', pattern: /^\/api\//, limit: 1, windowMs: 60_000}],
            logger,
            store: createMemoryRateLimitStore()
        });

        await guard(createInput().input);
        await expect(guard(createInput().input)).rejects.toBeInstanceOf(Response);
        expect(logger.warn).toHaveBeenCalledWith('request.rate_limited', expect.objectContaining({rule: 'default'}));
    });

    it('resets the bucket once the window elapses', async () => {
        vi.useFakeTimers();
        try {
            const guard = RequestRateLimit.inspect({
                rules: [{id: 'default', pattern: /^\/api\//, limit: 1, windowMs: 1_000}],
                store: createMemoryRateLimitStore()
            });

            await guard(createInput().input);
            await expect(guard(createInput().input)).rejects.toBeInstanceOf(Response);

            vi.advanceTimersByTime(1_001);

            const {input, responseHandlers} = createInput();
            await guard(input);
            expect(responseHandlers).toHaveLength(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('uses getClientAddress as the default client identifier when available', async () => {
        const increment = vi.fn(async (key: string, windowMs: number, now: number) => ({
            count: 1,
            resetAt: now + windowMs
        }));
        const guard = RequestRateLimit.inspect({
            rules: [{id: 'default', pattern: /^\/api\//, limit: 5, windowMs: 60_000}],
            store: {increment}
        });

        const {input} = createInput({getClientAddress: () => '203.0.113.7'});
        await guard(input);
        expect(increment).toHaveBeenCalledWith('default:203.0.113.7', 60_000, expect.any(Number));
    });

    it('falls back to header-based ip parsing when getClientAddress throws', async () => {
        const increment = vi.fn(async (key: string, windowMs: number, now: number) => ({
            count: 1,
            resetAt: now + windowMs
        }));
        const guard = RequestRateLimit.inspect({
            rules: [{id: 'default', pattern: /^\/api\//, limit: 5, windowMs: 60_000}],
            store: {increment}
        });

        const {input} = createInput({
            getClientAddress: () => {
                throw new Error('unsupported');
            }
        });
        await guard(input);
        expect(increment).toHaveBeenCalledWith('default:unknown', 60_000, expect.any(Number));
    });

    it('supports a custom store for scaling beyond a single process', async () => {
        const increment = vi.fn(async (key: string, windowMs: number, now: number) => ({
            count: 1,
            resetAt: now + windowMs
        }));
        const store: RateLimitStore = {increment};

        const guard = RequestRateLimit.inspect({
            rules: [{id: 'default', pattern: /^\/api\//, limit: 5, windowMs: 60_000}],
            store
        });

        const {input} = createInput();
        await guard(input);
        expect(increment).toHaveBeenCalledWith('default:unknown', 60_000, expect.any(Number));
    });
});

describe('createMemoryRateLimitStore', () => {
    it('increments counts within a window and resets after it expires', () => {
        vi.useFakeTimers();
        try {
            const store = createMemoryRateLimitStore();
            const now = Date.now();

            const first = store.increment('k', 1_000, now) as { count: number; resetAt: number };
            expect(first.count).toBe(1);

            const second = store.increment('k', 1_000, now + 10) as { count: number; resetAt: number };
            expect(second.count).toBe(2);
            expect(second.resetAt).toBe(first.resetAt);

            const third = store.increment('k', 1_000, now + 1_001) as { count: number; resetAt: number };
            expect(third.count).toBe(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('sweeps expired buckets on its cleanup interval', () => {
        vi.useFakeTimers();
        try {
            const store = createMemoryRateLimitStore({cleanupIntervalMs: 100});
            const now = Date.now();
            store.increment('k', 50, now);

            vi.advanceTimersByTime(200);

            const bucket = store.increment('k', 50, now + 200) as { count: number };
            expect(bucket.count).toBe(1);
        } finally {
            vi.useRealTimers();
        }
    });
});
