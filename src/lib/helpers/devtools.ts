import {dev} from '$app/environment';
import type {EnhanceInput} from "../index.js";

export const Devtools = {
    ignore: (input: EnhanceInput<'handle'>) => {
        if (input.url.pathname === '/.well-known/appspecific/com.chrome.devtools.json') {
            if (dev) console.debug(`[Devtool] ignored`);
            throw new Response(null, {status: 204, statusText: 'No Content'});
        }
    }
};
