import {describe, expect, it} from 'vitest';
import {CacheControl} from './cache.js';

const run = async (rules: any[], path: string, response: Response) => {
    const responseHandlers: any[] = [];
    const input = {url: new URL(`https://example.com${path}`), responseHandlers} as any;
    CacheControl.global(...rules)(input);
    let out = response;
    for (const h of responseHandlers) out = (await h({response: out})) ?? out;
    return out;
};

describe('CacheControl.global', () => {
    it('matches a global route pattern on every request', async () => {
        const rules = [{match: /^\/api\//g, directive: 'no-store'}];
        for (let i = 0; i < 2; i++) {
            const res = await run(rules, '/api/item', new Response('ok'));
            expect(res.headers.get('cache-control')).toBe('no-store');
        }
    });

    it('does not override a route-level cache-control', async () => {
        const res = await run(
            [{match: /^\/api\//, directive: 'no-store'}],
            '/api/x',
            new Response('ok', {headers: {'cache-control': 'public, max-age=60'}})
        );
        expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    });

    it('sets the header on immutable responses via a copy', async () => {
        const res = await run(
            [{match: /^\//, directive: 'no-store'}],
            '/x',
            Response.redirect('https://example.com/y', 302)
        );
        expect(res.status).toBe(302);
        expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('leaves unmatched paths alone', async () => {
        const res = await run([{match: /^\/api\//, directive: 'no-store'}], '/other', new Response('ok'));
        expect(res.headers.has('cache-control')).toBe(false);
    });
});
