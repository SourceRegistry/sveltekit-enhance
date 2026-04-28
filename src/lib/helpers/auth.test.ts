import {describe, expect, it} from 'vitest';
import {Auth} from './auth.js';

describe('Auth.Bearer', () => {
    const createInput = (authorization?: string) =>
        ({
            callType: 'method',
            request: new Request('http://localhost', {
                headers: authorization ? {Authorization: authorization} : {}
            })
        }) as any;

    it('returns token for valid bearer authorization header', () => {
        const result = Auth.Bearer(createInput('Bearer token-123'));
        expect(result).toEqual({token: 'token-123'});
    });

    it('throws when authorization header is missing', () => {
        expect(() => Auth.Bearer(createInput())).toThrow();
    });

    it('throws when bearer token is missing', () => {
        expect(() => Auth.Bearer(createInput('Bearer'))).toThrow();
    });
});
