import {describe, expect, it} from 'vitest';
import {
    array,
    array$,
    arrayString,
    basedOn,
    boolean,
    boolean$,
    Enum,
    Enum$,
    file,
    file$,
    fileRecord,
    files,
    Form,
    hasOneOf,
    json,
    json$,
    jsond,
    number,
    number$,
    onlyIf,
    onlyIfArrayPresent,
    onlyIfPresent,
    pattern$,
    process,
    record,
    reviver,
    schema,
    selector,
    selector$,
    string,
    string$,
    validate
} from './form.js';

const fd = (entries: Record<string, string | string[] | File | File[]>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(entries)) for (const item of [v].flat()) data.append(k, item as any);
    return data;
};
const caught = (fn: () => unknown): any => {
    try {
        fn();
    } catch (e) {
        return e;
    }
};
const status = (fn: () => unknown) => caught(fn)?.status;
const targets = (fn: () => unknown) => caught(fn)?.data?.targets;

describe('string / string$ / pattern$', () => {
    it('string: absent, null-ish, value, file', () => {
        expect(string(fd({}), 'a')).toBeUndefined();
        expect(string(fd({a: 'null'}), 'a')).toBeNull();
        expect(string(fd({a: 'x'}), 'a')).toBe('x');
        expect(status(() => string(fd({a: new File(['x'], 'f.txt')}), 'a'))).toBe(400);
    });
    it('string$: required and type checked', () => {
        expect(string$(fd({a: 'x'}), 'a')).toBe('x');
        expect(targets(() => string$(fd({}), 'a'))).toEqual(['a']);
        expect(status(() => string$(fd({a: new File(['x'], 'f.txt')}), 'a'))).toBe(400);
    });
    it('pattern$: regex and string patterns', () => {
        expect(pattern$(fd({a: 'abc'}), 'a', /^a/)).toBe('abc');
        expect(pattern$(fd({a: 'abc'}), 'a', '^a')).toBe('abc');
        expect(status(() => pattern$(fd({a: 'xbc'}), 'a', /^a/))).toBe(400);
        expect(status(() => pattern$(fd({}), 'a', /^a/))).toBe(400);
        expect(status(() => pattern$(fd({a: ''}), 'a', /^a/))).toBe(400);
    });
});

describe('number / number$', () => {
    it('number', () => {
        expect(number(fd({}), 'n')).toBeUndefined();
        expect(number(fd({n: ''}), 'n')).toBeUndefined();
        expect(number(fd({n: '3.5'}), 'n')).toBe(3.5);
        expect(status(() => number(fd({n: 'abc'}), 'n'))).toBe(400);
    });
    it('number$', () => {
        expect(number$(fd({n: '7'}), 'n')).toBe(7);
        expect(status(() => number$(fd({}), 'n'))).toBe(400);
    });
});

describe('boolean / boolean$', () => {
    it.each([
        ['true', true],
        ['t', true],
        ['on', true],
        ['ON', true],
        ['1', true],
        ['2', true],
        ['0', false],
        ['false', false],
        ['off', false],
        ['', false]
    ])('boolean(%j) -> %s', (value, expected) => {
        expect(boolean(fd({b: value}), 'b')).toBe(expected);
    });
    it('absent handling', () => {
        expect(boolean(fd({}), 'b')).toBeUndefined();
        expect(status(() => boolean$(fd({}), 'b'))).toBe(400);
        expect(boolean$(fd({b: 'yes'}), 'b')).toBe(false);
        expect(boolean$(fd({b: 'true'}), 'b')).toBe(true);
        expect(boolean$(fd({b: '1'}), 'b')).toBe(true);
    });
});

describe('json / json$ / jsond', () => {
    it('json', () => {
        expect(json(fd({}), 'j')).toBeUndefined();
        expect(json(fd({j: '{"a":"1","b":"true"}'}), 'j')).toEqual({a: 1, b: true});
        expect(json(fd({j: '[1,2]'}), 'j', (v: number[]) => v.length)).toBe(2);
        expect(status(() => json(fd({j: '{bad'}), 'j'))).toBe(400);
    });
    it('json$', () => {
        expect(json$(fd({j: '{"a":1}'}), 'j')).toEqual({a: 1});
        expect(status(() => json$(fd({}), 'j'))).toBe(400);
    });
    it('jsond with prefix, unpack, transform and processor', () => {
        const data = fd({'user.name': 'ada', 'user.tags': ['a', 'b'], other: 'x'});
        expect(jsond(data, {prefix_name: 'user.', unpack_prefixed: true})).toEqual({name: 'ada', tags: ['a', 'b']});
        expect(jsond(data, {prefix_name: 'user.'})).toEqual({user: {name: 'ada', tags: ['a', 'b']}});
        expect(jsond(fd({a: '1'}), {transform: (v) => Number(v), processor: (r) => ({...r, done: true})})).toEqual({
            a: 1,
            done: true
        });
    });
});

describe('record', () => {
    it('collapses single values and supports filter/transformer', () => {
        const data = fd({a: '1', b: ['2', '3']});
        expect(record(data)).toEqual({a: '1', b: ['2', '3']});
        expect(record(data, {filter: ([k]) => k === 'a'})).toEqual({a: '1'});
        expect(record(data, {transformer: ([k, v]) => [k.toUpperCase(), v]})).toEqual({A: '1', B: ['2', '3']});
    });
});

describe('files', () => {
    const f1 = new File(['hello'], 'a.txt');
    const empty = new File([], 'empty.txt');
    it('file / file$', () => {
        expect(file(fd({}), 'f')).toBeUndefined();
        expect(file(fd({f: f1}), 'f')).toBeInstanceOf(File);
        expect(file(fd({f: 'null'}), 'f')).toBeNull();
        expect(status(() => file(fd({f: 'text'}), 'f'))).toBe(400);
        expect(file$(fd({f: f1}), 'f')).toBeInstanceOf(File);
        expect(status(() => file$(fd({}), 'f'))).toBe(400);
        expect(status(() => file$(fd({f: 'text'}), 'f'))).toBe(400);
    });
    it('files keeps only non-empty named files', () => {
        expect(files(fd({}), 'f')).toEqual([]);
        expect(files(fd({f: [f1, empty, 'text'] as any}), 'f')).toHaveLength(1);
    });
    it('fileRecord groups by key and can strip the prefix', () => {
        const data = fd({'up.a': [f1, f1], 'up.b': f1, 'up.c': empty, other: f1});
        expect(Object.keys(fileRecord(data, 'up.'))).toEqual(['up.a', 'up.b']);
        const stripped = fileRecord(data, 'up.', true);
        expect(stripped['a']).toHaveLength(2);
        expect(stripped['b']).toHaveLength(1);
    });
});

describe('array / array$ / arrayString', () => {
    it('array', () => {
        expect(array(fd({}), 'a')).toBeUndefined();
        expect(array(fd({a: '[]'}), 'a')).toEqual([]);
        expect(array(fd({a: ['1', '2']}), 'a')).toEqual(['1', '2']);
        expect(array(fd({a: ['1', '2']}), 'a', (v) => Number(v))).toEqual([1, 2]);
    });
    it('array$', () => {
        expect(array$(fd({a: ['1']}), 'a')).toEqual(['1']);
        expect(array$(fd({a: ['1']}), 'a', (v) => `${v}!`)).toEqual(['1!']);
        expect(status(() => array$(fd({}), 'a'))).toBe(400);
    });
    it('arrayString', () => {
        expect(arrayString(fd({a: '1,2,3'}), 'a', ',')).toEqual(['1', '2', '3']);
        expect(arrayString(fd({a: '1,2'}), 'a', ',', Number)).toEqual([1, 2]);
        expect(arrayString(fd({}), 'a', ',')).toEqual([]);
    });
});

describe('Enum / Enum$', () => {
    const Colors = {red: 'R', green: 'G'};
    it('Enum', () => {
        expect(Enum(fd({}), 'c', Colors)).toBeUndefined();
        expect(Enum(fd({c: 'red'}), 'c', Colors)).toBe('red');
        expect(Enum(fd({c: 'blue'}), 'c', Colors)).toBeUndefined();
        expect(status(() => Enum(fd({c: new File(['x'], 'f.txt')}), 'c', Colors))).toBe(400);
    });
    it('Enum$', () => {
        expect(Enum$(fd({c: 'green'}), 'c', Colors)).toBe('G');
        expect(status(() => Enum$(fd({c: 'blue'}), 'c', Colors))).toBe(400);
    });
});

describe('conditionals and helpers', () => {
    it('onlyIf / onlyIfPresent / onlyIfArrayPresent / basedOn / process / hasOneOf', () => {
        expect(onlyIf(true, 'y', 'n' as any)).toBe('y');
        expect(onlyIf(false, 'y')).toBeUndefined();
        expect(onlyIfPresent(fd({a: '1'}), 'a', (v) => `${v}!`)).toBe('1!');
        expect(onlyIfPresent(fd({}), 'a', (v) => `${v}!`)).toBeUndefined();
        expect(onlyIfArrayPresent(fd({a: ['1', '2']}), 'a', (v) => v.length, 0)).toBe(2);
        expect(onlyIfArrayPresent(fd({}), 'a', (v) => v.length, 0)).toBe(0);
        expect(basedOn(2, (v) => v * 2)).toBe(4);
        expect(basedOn(2)).toBe(2);
        expect(process(fd({a: '5'}), 'a', (d, n) => Number(d.get(n)), (v, n) => `${n}=${v}`)).toBe('a=5');
        expect(hasOneOf(fd({a: '1'}), ['x', 'a'])).toBe(true);
        expect(hasOneOf(fd({a: '1'}), ['x'])).toBe(false);
    });
});

describe('selector / selector$', () => {
    it('picks the first matching key, with $default fallback', () => {
        const cases = {a: (v: FormDataEntryValue) => `a:${v}`, b: (v: FormDataEntryValue) => `b:${v}`};
        expect(selector(fd({b: '1'}), cases as any)).toBe('b:1');
        expect(selector(fd({z: '1'}), cases as any)).toBeUndefined();
        expect(selector(fd({z: '1'}), {...cases, $default: () => 'dflt'} as any)).toBe('dflt');
    });
    it('array mode passes all values', () => {
        expect(selector(fd({a: ['1', '2']}), {a: (v: any[]) => v.length} as any, true)).toBe(2);
    });
    it('selector$ throws 400 when nothing matches and uses $error when present', () => {
        const cases = {a: () => 'a'};
        expect(selector$(fd({a: '1'}), cases as any)).toBe('a');
        expect(status(() => selector$(fd({}), cases as any))).toBe(400);
        const seen: unknown[] = [];
        const e = caught(() => selector$(fd({}), {...cases, $error: (x: unknown) => void seen.push(x)} as any));
        expect(seen).toEqual(['Unable to find value']);
        expect(e.status).toBe(400);
    });
});

describe('reviver', () => {
    it.each([
        ['true', true],
        ['false', false],
        ['null', null],
        ['NaN', NaN],
        ['Infinity', Infinity],
        ['-Infinity', -Infinity],
        ['42', 42],
        ['-1.5', -1.5],
        ['1e3', 1000],
        ['007', '007'],
        ['hello', 'hello'],
        ['{"a":"1"}', {a: 1}],
        ['[ "2" ]', [2]]
    ])('%j', (input, expected) => {
        expect(reviver(undefined, input)).toEqual(expected);
    });
    it('passes non-strings through and keeps invalid json strings', () => {
        expect(reviver('k', 5)).toBe(5);
        expect(reviver('k', '{not json}')).toBe('{not json}');
    });
});

describe('validate / schema / FormContext', () => {
    const validator = (value: any) =>
        typeof value?.age === 'number' ? ({success: true, data: value} as const) : ({success: false, errors: [{path: '$.age', message: 'x'}]} as const);

    it('validate honours prefix_name', () => {
        const result = validate(fd({'p.age': '3'}), validator as any, {prefix_name: 'p.', unpack_prefixed: true});
        expect(result).toEqual({age: 3});
    });

    it('schema enhancer returns a form context with the validated result', async () => {
        const request = new Request('http://x', {
            method: 'POST',
            headers: {'content-type': 'application/x-www-form-urlencoded'},
            body: 'age=9'
        });
        const out: any = await schema(validator as any)({request} as any);
        expect(out.form.result).toEqual({age: 9});
        expect(out.form.string('age')).toBe('9');
    });

    it('Form.enhance yields an empty form for non-form requests', async () => {
        const request = new Request('http://x', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
        const {form} = await Form.enhance({request} as any);
        expect(form.has('anything')).toBe(false);
        expect(form.has()).toBe(false);
    });

    it('FormContext helpers delegate to the extractors', async () => {
        const request = new Request('http://x', {
            method: 'POST',
            headers: {'content-type': 'application/x-www-form-urlencoded'},
            body: 'n=4&b=on&d=2024-05-06&s=hi&j=%7B%22a%22%3A1%7D&arr=1&arr=2&e=red'
        });
        await Form.handle(request, ({form}) => {
            expect(form.number('n')).toBe(4);
            expect(form._number('n')).toBe(4);
            expect(form.number$('n')).toBe(4);
            expect(form.boolean('b')).toBe(true);
            expect(form.boolean$('b')).toBe(true);
            expect(form._boolean('missing')).toBeUndefined();
            expect(form.date('d')).toBeInstanceOf(Date);
            expect(form._date('d')).toBeInstanceOf(Date);
            expect(form.date$('d')).toBeInstanceOf(Date);
            expect(form.string('s')).toBe('hi');
            expect(form._string('s')).toBe('hi');
            expect(form.string$('s')).toBe('hi');
            expect(form.pattern$('s', /^h/)).toBe('hi');
            expect(form.json('j')).toEqual({a: 1});
            expect(form.json$('j')).toEqual({a: 1});
            expect(form.array('arr')).toEqual(['1', '2']);
            expect(form.array$('arr')).toEqual(['1', '2']);
            expect(form.enum('e', {red: 1})).toBe('red');
            expect(form.enum$('e', {red: 1})).toBe(1);
            expect(form.has('n', 'zzz')).toBe(true);
            expect(form.hasOneOf('zzz', 'n')).toBe(true);
            expect(form.onlyIf(true, 'y')).toBe('y');
            expect(form.onlyIfPresent('n', (v) => v)).toBe('4');
            expect(form.onlyIfArrayPresent('arr', (v) => v.length, 0)).toBe(2);
            expect(form.basedOn(1, (v) => v + 1)).toBe(2);
            expect(form.process('n', (name: string) => Number(form.data.get(name)), (v) => v * 2)).toBe(8);
            expect(form.selector({s: (v: any) => v})).toBe('hi');
            expect(form.selector$({s: (v: any) => v})).toBe('hi');
            expect(form.record()).toMatchObject({n: '4'});
            expect(form.jsond({})).toMatchObject({n: '4'});
            expect(form.files('none')).toEqual([]);
            expect(form.file('none')).toBeUndefined();
            expect(form.fileRecord('none')).toEqual({});
        });
    });
});

describe('Form.handle error handlers', () => {
    it('invokes error handlers and rethrows', async () => {
        const seen: unknown[] = [];
        const boom = new Error('boom');
        await expect(
            Form.handle(fd({}), () => {
                throw boom;
            }, (e) => void seen.push(e))
        ).rejects.toBe(boom);
        expect(seen).toEqual([boom]);
    });
});
