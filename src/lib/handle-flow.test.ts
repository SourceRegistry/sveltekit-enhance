import {describe, expect, it, vi} from 'vitest';
import {isRedirect, redirect} from '@sveltejs/kit';
import {action, error, fail, handle, load, method, not_good, success, type EnhanceFunction} from './index.js';

const createEvent = (headers: Record<string, string> = {}) =>
    ({
        cookies: {},
        params: {},
        route: {id: null},
        url: new URL('http://localhost/page'),
        locals: {},
        request: new Request('http://localhost/page', {headers}),
        fetch
    }) as any;

const run = (hook: ReturnType<typeof handle>, event: any, resolve = vi.fn(async () => new Response('route'))) =>
    Promise.resolve(hook({event, resolve} as any)).then((response) => ({response, resolve}));

describe('enhance.handle flow', () => {
    it('merges enhancer return values into the handler context in order', async () => {
        const seen = vi.fn();
        const hook = handle(
            async ({event, resolve, context}) => {
                seen(context);
                return resolve(event);
            },
            () => ({a: 1}),
            async () => ({b: 2, a: 3})
        );
        const {response} = await run(hook, createEvent());
        expect(await response.text()).toBe('route');
        expect(seen).toHaveBeenCalledWith({a: 3, b: 2});
    });

    it('short-circuits when an enhancer returns a Response', async () => {
        const main = vi.fn();
        const hook = handle(main as any, () => new Response('blocked', {status: 418}));
        const {response, resolve} = await run(hook, createEvent());
        expect(response.status).toBe(418);
        expect(main).not.toHaveBeenCalled();
        expect(resolve).not.toHaveBeenCalled();
    });

    it('lets an enhancer wrap the downstream response', async () => {
        const wrap: EnhanceFunction<'handle'> = async (input) => {
            const response = await input.resolve(input.event);
            const copy = new Response(response.body, response);
            copy.headers.set('x-wrapped', '1');
            return copy;
        };
        const hook = handle(({event, resolve}) => resolve(event), wrap);
        const {response} = await run(hook, createEvent());
        expect(response.headers.get('x-wrapped')).toBe('1');
        expect(await response.text()).toBe('route');
    });

    it('fails loudly when an enhancer resolves but returns no response', async () => {
        const bad: EnhanceFunction<'handle'> = async (input) => {
            await input.resolve(input.event);
        };
        const hook = handle(({event, resolve}) => resolve(event), bad);
        await expect(run(hook, createEvent())).rejects.toThrow(/did not return its response/);
    });

    it('resolveToRoute bypasses remaining enhancers and the main handler', async () => {
        const main = vi.fn();
        const later = vi.fn();
        const hook = handle(
            main as any,
            (input) => input.resolveToRoute(input.event),
            later
        );
        const {response, resolve} = await run(hook, createEvent());
        expect(await response.text()).toBe('route');
        expect(resolve).toHaveBeenCalledOnce();
        expect(main).not.toHaveBeenCalled();
        expect(later).not.toHaveBeenCalled();
    });

    it('resolveToRoute from the main handler path is available on the context input', async () => {
        const hook = handle(({event, resolve}) => resolve(event), (input) => {
            expect(typeof input.resolveToRoute).toBe('function');
            return {};
        });
        await run(hook, createEvent());
    });

    it('propagates redirects thrown by enhancers', async () => {
        const hook = handle(
            ({event, resolve}) => resolve(event),
            () => {
                redirect(303, '/login');
            }
        );
        const error_ = await run(hook, createEvent()).catch((e) => e);
        expect(isRedirect(error_)).toBe(true);
        expect(error_.location).toBe('/login');
    });

    it('returns Response objects thrown by enhancers', async () => {
        const hook = handle(
            ({event, resolve}) => resolve(event),
            () => {
                throw new Response('nope', {status: 429});
            }
        );
        const {response} = await run(hook, createEvent());
        expect(response.status).toBe(429);
    });

    it('runs registered error handlers before rethrowing unknown errors', async () => {
        const handler = vi.fn();
        const boom = new Error('boom');
        const hook = handle(
            ({event, resolve}) => resolve(event),
            (input) => {
                input.errorHandlers.push(handler);
            },
            () => {
                throw boom;
            }
        );
        await expect(run(hook, createEvent())).rejects.toBe(boom);
        expect(handler).toHaveBeenCalledWith(boom);
    });

    it('lets an error handler turn an error into a response by throwing a function', async () => {
        const hook = handle(
            ({event, resolve}) => resolve(event),
            (input) => {
                input.errorHandlers.push(() => {
                    throw () => new Response('recovered', {status: 500});
                });
            },
            () => {
                throw new Error('boom');
            }
        );
        const {response} = await run(hook, createEvent());
        expect(await response.text()).toBe('recovered');
    });

    it('applies response handlers in registration order', async () => {
        const order: string[] = [];
        const hook = handle(
            ({event, resolve}) => resolve(event),
            (input) => {
                input.responseHandlers.push(() => void order.push('first'));
                input.responseHandlers.push(() => void order.push('second'));
            }
        );
        await run(hook, createEvent());
        expect(order).toEqual(['first', 'second']);
    });
});

describe('enhance.handle SSE', () => {
    const sse = () => createEvent({accept: 'text/event-stream'});

    it('bypasses the main handler but still runs enhancers', async () => {
        const main = vi.fn();
        const enhancer = vi.fn(() => ({}));
        const hook = handle(main as any, enhancer);
        const {response, resolve} = await run(hook, sse());
        expect(await response.text()).toBe('route');
        expect(enhancer).toHaveBeenCalledOnce();
        expect(main).not.toHaveBeenCalled();
        expect(resolve).toHaveBeenCalledOnce();
    });

    it('lets enhancers reject SSE requests', async () => {
        const hook = handle(vi.fn() as any, () => new Response('no', {status: 401}));
        const {response} = await run(hook, sse());
        expect(response.status).toBe(401);
    });

    it('skips response handlers for event-stream responses only', async () => {
        const responseHandler = vi.fn();
        const hook = handle(
            ({event, resolve}) => resolve(event),
            (input) => {
                input.responseHandlers.push(responseHandler);
            }
        );
        await run(
            hook,
            sse(),
            vi.fn(async () => new Response('data: x\n\n', {headers: {'content-type': 'text/event-stream'}}))
        );
        expect(responseHandler).not.toHaveBeenCalled();

        await run(hook, createEvent());
        expect(responseHandler).toHaveBeenCalledOnce();
    });
});

describe('action / load / method contexts', () => {
    it('action merges enhancer context and passes it to the action', async () => {
        const fn = action(
            async (event) => success({got: event.context.user}),
            () => ({user: 'ada'})
        );
        expect(await fn(createEvent())).toEqual({got: 'ada'});
    });

    it('action returns fail() results instead of throwing', async () => {
        const fn = action(async () => fail(400, {message: 'bad'}));
        const result: any = await fn(createEvent());
        expect(result.status).toBe(400);
        expect(result.data).toEqual({message: 'bad'});
    });

    it('action rethrows redirects and http errors', async () => {
        const redirecting = action(async () => redirect(303, '/x'));
        expect(isRedirect(await redirecting(createEvent()).catch((e: unknown) => e))).toBe(true);
        const failing = action(async () => error(404, 'missing'));
        await expect(failing(createEvent())).rejects.toMatchObject({status: 404});
    });

    it('load merges context and exposes callType', async () => {
        const fn = load(
            async (event: any) => ({type: event.callType, user: event.context.user}),
            () => ({user: 'ada'})
        );
        expect(await fn(createEvent())).toEqual({type: 'load', user: 'ada'});
    });

    it('method merges context and returns the response', async () => {
        const fn = method(
            async (event: any) => new Response(event.context.token),
            () => ({token: 't-1'})
        );
        expect(await (await fn(createEvent())).text()).toBe('t-1');
    });

    it('a failing enhancer stops the chain', async () => {
        const body = vi.fn();
        const fn = method(
            body as any,
            (): never => error(401, 'unauthorized')
        );
        await expect(fn(createEvent())).rejects.toMatchObject({status: 401});
        expect(body).not.toHaveBeenCalled();
    });
});

describe('error helpers', () => {
    it('error() with a string and with a body object', () => {
        expect(() => error(400, 'plain')).toThrow();
        try {
            error(409, {message: 'conflict', code: 'X'} as any);
        } catch (e: any) {
            expect(e.status).toBe(409);
            expect(e.body).toMatchObject({message: 'conflict', code: 'X'});
        }
    });

    it('not_good uses fail for actions and error otherwise', () => {
        const thrown = (callType: string) => {
            try {
                not_good({callType} as any, 403, {message: 'no'});
            } catch (e) {
                return e as any;
            }
        };
        expect(thrown('action').data).toEqual({message: 'no'});
        expect(thrown('load').status).toBe(403);
        expect(thrown('load').body).toMatchObject({message: 'no'});
    });
});
