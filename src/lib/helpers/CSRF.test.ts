import {describe, expect, it, vi} from 'vitest';
import {CSRF, CSRFChecker} from './CSRF.js';

const input = (init: { method?: string; headers?: Record<string, string>; url?: string } = {}) => {
    const url = new URL(init.url ?? 'http://localhost/form');
    return {
        callType: 'handle',
        url,
        request: new Request(url, {method: init.method ?? 'POST', headers: init.headers})
    } as any;
};

const logger = () => ({debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()}) as any;
const form = {'content-type': 'application/x-www-form-urlencoded'};
const cross = {...form, origin: 'http://evil.test'};

const run = async (i: any, checker = () => false, log = logger()) => {
    try {
        return {result: await CSRF.inspect(checker, log)(i), log};
    } catch (e) {
        return {thrown: e as any, log};
    }
};

describe('CSRF.inspect', () => {
    it('allows same-origin form posts', async () => {
        const {result} = await run(input({headers: {...form, origin: 'http://localhost'}}));
        expect(result).toEqual({csrf_valid: true});
    });

    it('allows requests without an Origin header', async () => {
        const {result} = await run(input({headers: form}));
        expect(result).toEqual({csrf_valid: true});
    });

    it('allows cross-origin non-form content types', async () => {
        const {result} = await run(input({headers: {'content-type': 'application/json', origin: 'http://evil.test'}}));
        expect(result).toEqual({csrf_valid: true});
    });

    it('allows cross-origin safe methods', async () => {
        const {result} = await run(input({method: 'GET', headers: cross}));
        expect(result).toEqual({csrf_valid: true});
    });

    it('allows cross-origin form posts when checker approves', async () => {
        const {result} = await run(input({headers: cross}), () => true);
        expect(result).toEqual({csrf_valid: true});
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('blocks cross-origin form %s', async (method) => {
        const {result, thrown, log} = await run(input({method, headers: cross}));
        expect(result).toBeUndefined();
        expect(thrown).toBeDefined();
        expect(log.warn).toHaveBeenCalledOnce();
    });

    it('returns a JSON 403 when accept is exactly application/json', async () => {
        const {result} = await run(input({headers: {...cross, accept: 'application/json'}}));
        expect((result as Response).status).toBe(403);
        expect(await (result as Response).json()).toHaveProperty('message');
    });

    it('returns a JSON 403 when accept lists application/json among others', async () => {
        const {result} = await run(input({headers: {...cross, accept: 'text/plain, application/json;q=0.9, */*'}}));
        expect((result as Response).status).toBe(403);
        expect((result as Response).headers.get('content-type')).toContain('application/json');
    });

    it('does not treat a lookalike accept type as JSON', async () => {
        const {result, thrown} = await run(input({headers: {...cross, accept: 'application/jsonp'}}));
        expect(result).toBeUndefined();
        expect(thrown).toBeDefined();
    });

    it('logs only safe headers', async () => {
        const {log} = await run(input({headers: {...cross, cookie: 'secret=1', authorization: 'Bearer x'}}));
        const logged = log.warn.mock.calls[0][1].headers;
        expect(logged).not.toHaveProperty('cookie');
        expect(logged).not.toHaveProperty('authorization');
        expect(logged).toHaveProperty('origin');
    });
});

describe('CSRFChecker', () => {
    it('list matches exact pathnames', () => {
        const check = CSRFChecker.list('/webhook');
        expect(check({url: new URL('http://x/webhook')})).toBe(true);
        expect(check({url: new URL('http://x/webhook/other')})).toBe(false);
    });

    it('regex matches pathnames', () => {
        const check = CSRFChecker.regex(/^\/api\//);
        expect(check({url: new URL('http://x/api/pay')})).toBe(true);
        expect(check({url: new URL('http://x/other')})).toBe(false);
    });
});

describe('CSRFChecker.regex with global flag', () => {
    it('matches a global route pattern consistently', () => {
        const matches = CSRFChecker.regex(/^\/trusted\//g);
        const i = {url: new URL('https://example.com/trusted/path')};

        expect(matches(i)).toBe(true);
        expect(matches(i)).toBe(true);
    });
});
