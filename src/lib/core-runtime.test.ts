import {describe, expect, it, vi} from 'vitest';
import {action, handle, load, method} from './index.js';
import {RequestCorrelation} from './helpers/request-correlation.js';
import {Deferred} from './helpers/internal/Deferred.js';
import {StartUp} from './helpers/startup.js';

const event = () =>
    ({
        cookies: {},
        params: {},
        route: {id: null},
        url: new URL('http://localhost/'),
        locals: {},
        request: new Request('http://localhost/'),
        fetch
    }) as any;

describe('error handlers run for async failures in every call type', () => {
    const boom = async () => {
        throw new Error('boom');
    };

    it.each([
        ['load', load],
        ['action', action],
        ['method', method]
    ] as const)('%s', async (_name, factory) => {
        const seen = vi.fn();
        const fn = (factory as any)(boom, (i: any) => {
            i.errorHandlers.push(seen);
            return {};
        });
        await expect(fn(event())).rejects.toThrow('boom');
        expect(seen).toHaveBeenCalledOnce();
    });
});

describe('handle response handlers', () => {
    it('applies headers to immutable responses via a replacement Response', async () => {
        const hook = handle(
            async ({resolve, event}) => resolve(event),
            RequestCorrelation.attach
        );
        const redirect = Response.redirect('http://localhost/next', 302);
        const response = await hook({event: event(), resolve: async () => redirect} as any);
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('http://localhost/next');
        expect(response.headers.get('x-correlation-id')).toBeTruthy();
    });

    it('keeps the original response when a handler returns nothing', async () => {
        const original = new Response('ok');
        const hook = handle(
            async ({resolve, event}) => resolve(event),
            (i: any) => {
                i.responseHandlers.push(() => undefined);
            }
        );
        expect(await hook({event: event(), resolve: async () => original} as any)).toBe(original);
    });
});

describe('Deferred', () => {
    it('exposes the rejection reason for Deferred.Derive without unhandled rejections', async () => {
        const reason = new Error('why');
        const d = Deferred.Derive(Promise.reject(reason));
        await new Promise((r) => setTimeout(r, 5));
        expect(d.isRejected).toBe(true);
        expect(d.rejectReason).toBe(reason);
    });

    it('exposes the reason when rejected directly and still rejects awaiters', async () => {
        const d = new Deferred<number>();
        d.reject('nope');
        expect(d.rejectReason).toBe('nope');
        await expect(d.promise).rejects.toBe('nope');
    });
});

describe('StartUp.await', () => {
    const input = (path: string, accept = 'application/json') =>
        ({
            url: new URL(`http://localhost${path}`),
            request: new Request(`http://localhost${path}`, {headers: {accept}}),
            fetch
        }) as any;

    it('returns 503 JSON while pending and passes once resolved', async () => {
        const d = new Deferred();
        const guard = StartUp.await([d]);
        const res = await guard(input('/api')).catch((e: Response) => e);
        expect((res as Response).status).toBe(503);
        expect((res as Response).headers.get('retry-after')).toBe('4');
        d.resolve();
        expect(await guard(input('/api'))).toBeUndefined();
    });

    it('reports the real rejection reason to onFailure', async () => {
        const onFailure = vi.fn();
        const guard = StartUp.await([Promise.reject(new Error('db down'))], {onFailure});
        await new Promise((r) => setTimeout(r, 5));
        await guard(input('/api')).catch(() => {});
        expect(onFailure.mock.calls[0][0]).toEqual(new Error('db down'));
    });
});
