import {describe, expect, it} from 'vitest';
import {ClientIp} from './internal/client_ip.js';
import {createMemoryRateLimitStore, RequestRateLimit} from './request-rate-limit.js';

const req = (headers: Record<string, string>) => new Request('http://x', {headers});

describe('ClientIp', () => {
    const ip = ClientIp({TRUST_PROXY_HEADERS: true, TRUST_PROXY_HOPS: 1});
    it('uses the last hop of x-forwarded-for', () => {
        expect(ip.fromRequest(req({'x-forwarded-for': '6.6.6.6, 1.2.3.4'}))).toBe('1.2.3.4');
    });
    it('does not fall back to spoofable x-real-ip when x-forwarded-for is too short', () => {
        const two = ClientIp({TRUST_PROXY_HEADERS: true, TRUST_PROXY_HOPS: 2});
        expect(two.fromRequest(req({'x-forwarded-for': '1.2.3.4', 'x-real-ip': '9.9.9.9'}))).toBeUndefined();
    });
    it('uses x-real-ip only when x-forwarded-for is absent', () => {
        expect(ip.fromRequest(req({'x-real-ip': '9.9.9.9'}))).toBe('9.9.9.9');
    });
    it('ignores proxy headers unless trusted', () => {
        expect(ClientIp().fromRequest(req({'x-forwarded-for': '1.2.3.4'}))).toBeUndefined();
    });
});

describe('memory rate limit store', () => {
    it('stays bounded by maxKeys', () => {
        const store = createMemoryRateLimitStore({maxKeys: 3});
        for (let i = 0; i < 50; i++) store.increment(`k${i}`, 60_000, 1000);
        // oldest evicted: first key starts fresh again
        expect((store.increment('k0', 60_000, 1000) as any).count).toBe(1);
        expect((store.increment('k49', 60_000, 1000) as any).count).toBe(2);
    });
});

describe('RequestRateLimit proxy options', () => {
    it('keys on forwarded addresses when trusted and getClientAddress is unavailable', async () => {
        const limiter = RequestRateLimit({
            rules: [{id: 'r', pattern: /./, limit: 1, windowMs: 60_000}],
            trustProxyHeaders: true,
            store: createMemoryRateLimitStore()
        });
        const call = (xff: string) => {
            const url = new URL('http://x/a');
            return limiter.inspect({
                request: new Request(url, {headers: {'x-forwarded-for': xff}}),
                url,
                locals: {},
                responseHandlers: []
            } as any);
        };
        await call('1.1.1.1');
        await call('2.2.2.2'); // different client: not limited
        await expect(call('1.1.1.1')).rejects.toBeInstanceOf(Response);
    });
});
