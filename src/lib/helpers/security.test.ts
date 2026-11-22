import {afterEach, describe, expect, it, vi} from 'vitest';
import {Auth} from './auth.js';
import {Enum, jsond, selector} from './form.js';
import {RequestMonitor} from './request-monitor.js';

afterEach(() => {
    delete (Object.prototype as any).polluted;
    delete (Object.prototype.toString as any).polluted;
});

describe('jsond prototype safety', () => {
    it.each(['__proto__.polluted', 'constructor.prototype.polluted', 'a.__proto__.polluted', 'prototype.polluted'])(
        'ignores %s',
        (key) => {
            const fd = new FormData();
            fd.append(key, 'yes');
            fd.append('ok', '1');
            const result = jsond(fd);
            expect(({} as any).polluted).toBeUndefined();
            expect(result).toEqual({ok: '1'});
        }
    );

    it('does not walk into inherited properties', () => {
        const fd = new FormData();
        fd.append('toString.polluted', 'yes');
        jsond(fd);
        expect((Object.prototype.toString as any).polluted).toBeUndefined();
    });

    it('still unpacks nested and repeated keys', () => {
        const fd = new FormData();
        fd.append('a.b', '1');
        fd.append('a.c', '2');
        fd.append('t', 'x');
        fd.append('t', 'y');
        expect(jsond(fd)).toEqual({a: {b: '1', c: '2'}, t: ['x', 'y']});
    });
});

describe('Auth.Bearer scheme', () => {
    const run = (authorization: string) =>
        Auth.Bearer({callType: 'method', request: new Request('http://x', {headers: {authorization}})} as any);

    it('accepts case-insensitive Bearer', () => {
        expect(run('bearer abc')).toEqual({token: 'abc'});
        expect(run('BEARER   abc ')).toEqual({token: 'abc'});
    });

    it.each(['Basic abc', 'Token abc', 'abc', 'Bearer a b', 'Bearerabc'])('rejects %s', (value) => {
        expect(() => run(value)).toThrow();
    });
});

describe('own-property lookups', () => {
    it('Enum ignores inherited keys', () => {
        const fd = new FormData();
        fd.append('c', 'constructor');
        fd.append('v', 'A');
        expect(Enum(fd, 'c', {A: 'a'})).toBeUndefined();
        expect(Enum(fd, 'v', {A: 'a'})).toBe('A');
    });

    it('selector ignores inherited and $-prefixed form keys', () => {
        const fd = new FormData();
        fd.append('toString', '1');
        fd.append('$default', '1');
        fd.append('$error', '1');
        const $default = vi.fn(() => 'default');
        const $error = vi.fn();
        expect(selector(fd, {a: () => 'a', $default, $error} as any)).toBe('default');
        expect($default).toHaveBeenCalledOnce();
        expect($error).not.toHaveBeenCalled();
    });
});

describe('RequestMonitor logging hygiene', () => {
    const run = async (headers: Record<string, string>, search = '') => {
        const logger = {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()};
        const url = new URL(`https://example.com/api${search}`);
        const input = {
            locals: {},
            request: new Request(url, {headers}),
            url,
            route: {id: '/api'},
            event: {},
            resolve: async () => new Response('ok')
        } as any;
        await RequestMonitor.trace({logger})(input);
        return {logger, input};
    };

    it('does not log the query string', async () => {
        const {logger} = await run({}, '?token=secret');
        const ctx = logger.info.mock.calls[0][1];
        expect(ctx.url).toBe('https://example.com/api');
        expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret');
    });

    it('ignores unsafe inbound request ids', async () => {
        const {input} = await run({'x-request-id': 'bad id\nforged line'});
        expect(input.locals.trace.id).not.toContain('forged');
    });

    it('keeps safe inbound ids', async () => {
        const {input} = await run({'x-correlation-id': 'abc-123'});
        expect(input.locals.trace.id).toBe('abc-123');
    });
});
