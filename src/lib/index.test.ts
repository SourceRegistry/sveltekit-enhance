import {describe, expect, it} from 'vitest';
import {handle, type EnhanceFunction} from './index.js';

const createEvent = () =>
    ({
        cookies: {},
        params: {},
        route: {id: null},
        url: new URL('http://localhost'),
        locals: {},
        request: new Request('http://localhost'),
        fetch
    }) as any;

describe('enhance.handle', () => {
    it('merges resolve options like SvelteKit sequence', async () => {
        expect.assertions(4);

        const calls: string[] = [];

        const outer = ((input) =>
            input.resolve(input.event, {
                transformPageChunk: ({html}) => {
                    calls.push('outer transform');
                    return `${html}:outer`;
                },
                preload: () => {
                    calls.push('outer preload');
                    return true;
                },
                filterSerializedResponseHeaders: () => {
                    calls.push('outer filter');
                    return true;
                }
            })) as EnhanceFunction<'handle'>;

        const hook = handle(
            ({event, resolve}) =>
                resolve(event, {
                    transformPageChunk: ({html}) => {
                        calls.push('inner transform');
                        return `${html}:inner`;
                    },
                    preload: () => {
                        calls.push('inner preload');
                        return false;
                    },
                    filterSerializedResponseHeaders: () => {
                        calls.push('inner filter');
                        return false;
                    }
                }),
            outer
        );

        await hook({
            event: createEvent(),
            resolve: async (_event, options) => {
                expect(await options?.transformPageChunk?.({html: 'html', done: true})).toBe(
                    'html:inner:outer'
                );
                expect(options?.preload?.({type: 'js', path: '/app.js'})).toBe(true);
                expect(options?.filterSerializedResponseHeaders?.('x-test', 'value')).toBe(true);
                return new Response('ok');
            }
        });

        expect(calls).toEqual(['inner transform', 'outer transform', 'outer preload', 'outer filter']);
    });

    it('keeps context merging for enhancers that do not resolve', async () => {
        expect.assertions(2);

        const hook = handle(
            ({context, resolve, event}) => {
                expect(context).toEqual({token: 'abc'});
                return resolve(event);
            },
            (() => ({token: 'abc'})) as EnhanceFunction<'handle'>
        );

        const response = await hook({
            event: createEvent(),
            resolve: async () => new Response('ok')
        });

        expect(await response.text()).toBe('ok');
    });
});
