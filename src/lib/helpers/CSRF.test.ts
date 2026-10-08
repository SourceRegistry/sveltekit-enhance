import {describe, expect, it} from 'vitest';
import {CSRFChecker} from './CSRF.js';

describe('CSRFChecker.regex', () => {
    it('matches a global route pattern consistently', () => {
        const pattern = /^\/trusted\//g;
        const matches = CSRFChecker.regex(pattern);
        const input = {url: new URL('https://example.com/trusted/path')};

        expect(matches(input)).toBe(true);
        expect(matches(input)).toBe(true);
    });
});
