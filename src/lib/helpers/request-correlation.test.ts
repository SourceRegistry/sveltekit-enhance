import {describe, expect, it} from 'vitest';
import {RequestCorrelation} from './request-correlation.js';

describe('RequestCorrelation.attach', () => {
    it('uses incoming x-correlation-id and appends it to response headers', async () => {
        const responseHandlers: Array<({response}: {response: Response}) => unknown> = [];
        const locals: Record<string, unknown> = {};
        const input = {
            request: new Request('http://localhost', {
                headers: {'x-correlation-id': 'abc-123'}
            }),
            locals,
            responseHandlers
        } as any;

        RequestCorrelation.attach(input);
        expect(locals.correlation_id).toBe('abc-123');
        expect(responseHandlers).toHaveLength(1);

        const response = new Response('ok');
        await responseHandlers[0]({response});
        expect(response.headers.get('x-correlation-id')).toBe('abc-123');
    });

    it('falls back to x-request-id when correlation id is missing', () => {
        const responseHandlers: Array<({response}: {response: Response}) => unknown> = [];
        const locals: Record<string, unknown> = {};
        const input = {
            request: new Request('http://localhost', {
                headers: {'x-request-id': 'req-001'}
            }),
            locals,
            responseHandlers
        } as any;

        RequestCorrelation.attach(input);
        expect(locals.correlation_id).toBe('req-001');
    });

    it('generates a uuid when incoming ids are invalid', () => {
        const responseHandlers: Array<({response}: {response: Response}) => unknown> = [];
        const locals: Record<string, unknown> = {};
        const input = {
            request: new Request('http://localhost', {
                headers: {'x-correlation-id': 'bad id with spaces'}
            }),
            locals,
            responseHandlers
        } as any;

        RequestCorrelation.attach(input);
        expect(typeof locals.correlation_id).toBe('string');
        expect((locals.correlation_id as string).length).toBeGreaterThan(0);
        expect(locals.correlation_id).not.toBe('bad id with spaces');
    });
});
