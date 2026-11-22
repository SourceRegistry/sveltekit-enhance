import {describe, expect, it} from 'vitest';
import {date, date$, Form, json$, jsond, number, selector, validate} from './form.js';

const fd = (entries: Record<string, string | string[]>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(entries)) for (const item of [v].flat()) data.append(k, item);
    return data;
};
const failure = (fn: () => unknown) => {
    try {
        fn();
    } catch (e: any) {
        return e;
    }
};

describe('Form.handle input types', () => {
    it('accepts FormData', async () => {
        expect(await Form.handle(fd({a: '1'}), async ({data}) => data.get('a'))).toBe('1');
    });
    it('accepts Promise<FormData>', async () => {
        expect(await Form.handle(Promise.resolve(fd({a: '2'})), async ({form}) => form.string('a'))).toBe('2');
    });
    it('parses a form Request', async () => {
        const request = new Request('http://x', {
            method: 'POST',
            headers: {'content-type': 'application/x-www-form-urlencoded'},
            body: 'a=3'
        });
        expect(await Form.handle(request, async ({form}) => form.string('a'))).toBe('3');
    });
    it('rejects a non-form Request with 400', async () => {
        const request = new Request('http://x', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
        await expect(Form.handle(request, async () => 1)).rejects.toMatchObject({status: 400});
    });
});

describe('selector error propagation', () => {
    it('rethrows processor failures when no $error is given', () => {
        const boom = new Error('inner');
        expect(() => selector(fd({x: '1'}), {x: () => { throw boom; }} as any)).toThrow(boom);
    });
    it('routes failures to $error when provided', () => {
        const result = selector(fd({x: '1'}), {x: () => { throw new Error('inner'); }, $error: () => 'handled'} as any);
        expect(result).toBe('handled');
    });
});

describe('json$', () => {
    it('fails with 400 directly on invalid json', () => {
        const e = failure(() => json$(fd({j: '{bad'}), 'j'));
        expect(e).toBeDefined();
        expect(typeof e).not.toBe('function');
        expect(e.status).toBe(400);
    });
});

describe('validate', () => {
    const validator = (value: any) =>
        typeof value.age === 'number'
            ? ({success: true, data: value} as const)
            : ({success: false, errors: [{path: '$.age', message: 'nope'}, {path: '$.name', message: 'nope'}]} as const);

    it('honours a custom transform', () => {
        const result = validate(fd({age: 'x'}), validator as any, {transform: () => 42});
        expect(result).toEqual({age: 42});
    });
    it('revives by default', () => {
        expect(validate(fd({age: '7'}), validator as any)).toEqual({age: 7});
    });
    it('reports a flat list of targets', () => {
        const e = failure(() => validate(fd({age: 'x'}), validator as any));
        expect(e.data.targets).toEqual(['age', 'name']);
    });
});

describe('scalar parsing', () => {
    it('number treats whitespace-only as empty', () => {
        expect(number(fd({n: '  '}), 'n')).toBeUndefined();
        expect(number(fd({n: ' 5 '}), 'n')).toBe(5);
    });
    it('date and date$ reject invalid dates', () => {
        expect(failure(() => date(fd({d: 'not-a-date'}), 'd')).status).toBe(400);
        expect(failure(() => date$(fd({d: 'not-a-date'}), 'd', (f, n) => f.get(n) as string)).status).toBe(400);
        expect(date(fd({d: '2024-01-02'}), 'd')).toBeInstanceOf(Date);
        expect(date(fd({d: ''}), 'd')).toBeNull();
    });
});

describe('jsond key conflicts', () => {
    it('ignores a nested key that collides with a scalar instead of throwing', () => {
        expect(jsond(fd({a: '1', 'a.b': '2'}))).toEqual({a: '1'});
    });
});
