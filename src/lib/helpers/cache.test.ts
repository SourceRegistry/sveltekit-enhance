import {describe, expect, it, vi} from 'vitest';
import {CacheControl} from './cache.js';

describe('CacheControl.global', () => {
    it('matches a global route pattern on every request', () => {
        const pattern = /^\/api\//g;
        const setHeaders = vi.fn();
        const enhance = CacheControl.global({match: pattern, directive: 'no-store'});
        const input = {url: new URL('https://example.com/api/item'), setHeaders} as any;

        enhance(input);
        enhance(input);

        expect(setHeaders).toHaveBeenCalledTimes(2);
        expect(setHeaders).toHaveBeenCalledWith({'cache-control': 'no-store'});
    });
});
