import {describe, expect, it} from 'vitest';
import {array, boolean, jsond, number, reviver, string, string$} from './form.js';

describe('form helpers', () => {
    it('reviver converts basic scalar values', () => {
        expect(reviver(undefined, 'true')).toBe(true);
        expect(reviver(undefined, 'false')).toBe(false);
        expect(reviver(undefined, '42')).toBe(42);
        expect(reviver(undefined, 'null')).toBeNull();
    });

    it('jsond builds nested objects and unpacks prefixes', () => {
        const data = new FormData();
        data.append('payload.user.name', 'alex');
        data.append('payload.user.age', '30');
        data.append('payload.tags', 'a');
        data.append('payload.tags', 'b');

        const result = jsond(data, {prefix_name: 'payload.', unpack_prefixed: true});
        expect(result).toEqual({
            user: {name: 'alex', age: '30'},
            tags: ['a', 'b']
        });
    });

    it('string/number/boolean/array read typed values from form data', () => {
        const data = new FormData();
        data.append('name', 'john');
        data.append('age', '18');
        data.append('enabled', 'on');
        data.append('roles', 'admin');
        data.append('roles', 'editor');

        expect(string(data, 'name')).toBe('john');
        expect(number(data, 'age')).toBe(18);
        expect(boolean(data, 'enabled')).toBe(true);
        expect(array(data, 'roles')).toEqual(['admin', 'editor']);
    });

    it('string$ throws when value is missing', () => {
        const data = new FormData();
        expect(() => string$(data, 'email')).toThrow();
    });
});
