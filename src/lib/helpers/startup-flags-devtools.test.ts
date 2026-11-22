import {afterEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({dev: false, flags: {} as Record<string, unknown>}));
vi.mock('$app/env', () => ({
    get dev() {
        return state.dev;
    }
}));
vi.mock('$app/env/public', () => ({
    get A() {
        return state.flags.A;
    },
    get B() {
        return state.flags.B;
    },
    get MISSING() {
        return state.flags.MISSING;
    }
}));

import {Deferred} from './internal/Deferred.js';
import {StartUp} from './startup.js';
import {FeatureFlag, FeatureFlagChecker, disabled, enabled} from './featureflag.js';
import {Devtools} from './devtools.js';

afterEach(() => {
    state.dev = false;
    state.flags = {};
});

const input = (path: string, headers: Record<string, string> = {}, fetchImpl: any = fetch) =>
    ({
        callType: 'handle',
        url: new URL(`http://localhost${path}`),
        request: new Request(`http://localhost${path}`, {headers}),
        fetch: fetchImpl
    }) as any;
const thrown = async (fn: () => unknown): Promise<any> => {
    try {
        return await fn();
    } catch (e) {
        return e;
    }
};

describe('StartUp.await', () => {
    it('passes everything through once ready', async () => {
        const guard = StartUp.await([Promise.resolve(1)]);
        await new Promise((r) => setTimeout(r, 5));
        expect(await guard(input('/anything'))).toBeUndefined();
    });

    it('serves the startup page as 503 HTML for html requests while pending', async () => {
        const d = new Deferred();
        const guard = StartUp.await([d], {showPage: '/starting'});
        const fetchImpl = vi.fn(async () => new Response('<h1>starting</h1>', {headers: {'content-type': 'text/html'}}));
        const res: Response = await thrown(() => guard(input('/dash', {accept: 'text/html'}, fetchImpl)));
        expect(res.status).toBe(503);
        expect(res.headers.get('retry-after')).toBe('4');
        expect(res.headers.get('content-type')).toBe('text/html');
        expect(await res.text()).toBe('<h1>starting</h1>');
        expect(fetchImpl).toHaveBeenCalledWith('/starting');
    });

    it('serves custom JSON for other requests', async () => {
        const guard = StartUp.await([new Deferred()], {showJSON: {error: 'warming'}});
        const res: Response = await thrown(() => guard(input('/api')));
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({error: 'warming'});
    });

    it('lets allowedPaths and the startup page through while pending', async () => {
        const guard = StartUp.await([new Deferred()], {allowedPaths: ['/health']});
        expect(await guard(input('/health'))).toBeUndefined();
        expect(await guard(input('/startup'))).toBeUndefined();
    });

    it('redirects the startup page to readyRedirect once ready, except in dev', async () => {
        const d = new Deferred();
        const guard = StartUp.await([d], {readyRedirect: '/home'});
        d.resolve();
        const res: Response = await thrown(() => guard(input('/startup')));
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/home');

        state.dev = true;
        expect(await guard(input('/startup'))).toBeUndefined();
    });

    it('calls onFailure when a startup item rejects', async () => {
        const onFailure = vi.fn();
        const d = new Deferred();
        const guard = StartUp.await([d], {onFailure});
        d.reject(new Error('db down'));
        await guard(input('/api')).catch(() => {});
        expect(onFailure).toHaveBeenCalledWith(new Error('db down'));
    });

    it('default onFailure writes to stderr and exits', async () => {
        const exit = vi.spyOn(globalThis.process, 'exit').mockImplementation((() => undefined) as any);
        const write = vi.spyOn(globalThis.process.stderr, 'write').mockImplementation((() => true) as any);
        const d = new Deferred();
        const guard = StartUp.await([d]);
        d.reject('bad');
        await guard(input('/api')).catch(() => {});
        expect(write).toHaveBeenCalledWith(expect.stringContaining('bad'));
        expect(exit).toHaveBeenCalledWith(1);
        exit.mockRestore();
        write.mockRestore();
    });
});

describe('Deferred', () => {
    it('tracks state transitions and ignores later settles', async () => {
        const d = new Deferred<number>();
        expect(d.isPending).toBe(true);
        d.resolve(1);
        d.reject(new Error('ignored'));
        d.resolve(2);
        expect(await d.promise).toBe(1);
        expect(d.isResolved).toBe(true);
        expect(d.isRejected).toBe(false);
        expect(d.isSettled).toBe(true);
        expect(d.isPending).toBe(false);
    });

    it('step() returns settle callbacks usable with then()', async () => {
        const ok = new Deferred<string>();
        await Promise.resolve('v').then(...ok.step());
        expect(ok.isResolved).toBe(true);

        const bad = new Deferred<string>();
        await Promise.reject('why').then(...bad.step());
        expect(bad.isRejected).toBe(true);
        expect(bad.rejectReason).toBe('why');
    });
});

describe('FeatureFlag', () => {
    const run = (guard: (i: any) => unknown) => thrown(() => guard({callType: 'method'}));

    it('all: passes only when every flag is enabled', async () => {
        state.flags = {A: 'true', B: 'On'};
        expect(await run(FeatureFlag.all('A', 'B'))).toEqual({flags: ['A', 'B']});
        state.flags = {A: 'true', B: 'false'};
        expect((await run(FeatureFlag.all('A', 'B'))).status).toBe(503);
        state.flags = {};
        expect((await run(FeatureFlag.all('A'))).status).toBe(503);
    });

    it('oneOf: passes when any flag is enabled', async () => {
        state.flags = {A: false, B: 1};
        expect(await run(FeatureFlag.oneOf('A', 'B'))).toEqual({flags: ['A', 'B']});
        state.flags = {A: false};
        expect((await run(FeatureFlag.oneOf('A', 'B'))).status).toBe(503);
    });

    it('is* helpers and checkers', () => {
        state.flags = {A: 'on', B: '0'};
        expect(FeatureFlag.isEnabled('A')).toBe(true);
        expect(FeatureFlag.isEnabled('B')).toBe(false);
        expect(FeatureFlag.isDisabled('B')).toBe(true);
        expect(FeatureFlag.is('A', (v) => v === 'ON')).toBe(true);
        expect(enabled('true')).toBe(true);
        expect(disabled('true')).toBe(false);
        expect(FeatureFlagChecker.enabled('off')).toBe(false);
    });

    it('dev mode bypasses every check (documented)', async () => {
        state.dev = true;
        state.flags = {};
        expect(await run(FeatureFlag.all('MISSING'))).toEqual({flags: ['MISSING']});
        expect(await run(FeatureFlag.oneOf('MISSING'))).toEqual({flags: ['MISSING']});
        expect(FeatureFlag.isEnabled('MISSING')).toBe(true);
    });
});

describe('Devtools.ignore', () => {
    it('answers the Chrome devtools probe with 204', async () => {
        const res: Response = await thrown(() => Devtools.ignore(input('/.well-known/appspecific/com.chrome.devtools.json')));
        expect(res.status).toBe(204);
    });
    it('ignores every other path', () => {
        expect(Devtools.ignore(input('/other'))).toBeUndefined();
    });
});
