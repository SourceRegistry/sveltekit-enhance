import { enhance, fail, Form, success } from '#lib';

const notes: { id: number; body: string }[] = [];
let nextId = 1;

export const load = () => ({ notes: [...notes].reverse() });

export const actions = {
    default: enhance.action(({ context }) => {
        const body = context.form.string$('body').trim();
        if (!body || body.length > 500) {
            fail(400, { message: 'Enter a note of 1 to 500 characters.' });
        }
        notes.push({ id: nextId++, body });
        return success({ saved: true, message: '' });
    }, Form.enhance)
};
