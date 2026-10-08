import {describe, expect, it, vi} from 'vitest';
import {RequestMonitor} from './request-monitor.js';

describe('RequestMonitor.trace', () => {
    it('continues when the adapter cannot provide a client address', async () => {
        const logger = {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()};
        const record = vi.fn();
        const response = new Response('ok');
        const url = new URL('https://example.com/api');
        const input = {
            locals: {},
            request: new Request(url),
            url,
            route: {id: '/api'},
            getClientAddress: () => { throw new Error('unsupported'); },
            event: {},
            resolve: async () => response
        } as any;

        expect(await RequestMonitor.trace({logger, record})(input)).toBe(response);
        expect(record).toHaveBeenCalledWith(expect.objectContaining({status: 200, path: '/api'}));
        expect(logger.info).toHaveBeenCalledWith('http.request.completed', expect.objectContaining({client_ip: undefined}));
    });
});
