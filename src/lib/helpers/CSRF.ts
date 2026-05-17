import {json} from '@sveltejs/kit';
import {type EnhanceFunction, type EnhanceInput, error} from "../index.js";
import type {MaybePromise} from "../index.js";
import type {Logger} from "./logger.js";

function isContentType(request: Request, ...types: string[]) {
    const type = request.headers.get('content-type')?.split(';', 1)[0].trim() ?? '';
    return types.includes(type.toLowerCase());
}

function isFormContentType(request: Request) {
    return isContentType(
        request,
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        'text/plain'
    );
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SAFE_LOG_HEADERS = new Set(['content-type', 'origin', 'referer', 'user-agent', 'accept', 'host']);

export const CSRF = {
    inspect: (checker: (input: EnhanceInput) => MaybePromise<boolean>, logger: Logger = console): EnhanceFunction<'handle'> =>
        async (input: EnhanceInput<'handle'>) => {
            const {request, url} = input;
            const origin = request.headers.get('origin');

            const forbidden =
                isFormContentType(request) &&
                MUTATING_METHODS.has(request.method) &&
                origin !== null &&
                origin !== url.origin &&
                !(await checker(input));

            if (forbidden) {
                const message = `Cross-site ${request.method} form submissions are forbidden`;
                logger.warn('CSRF Violation detected', {
                    url: url.toString(),
                    headers: Object.fromEntries(
                        [...request.headers.entries()].filter(([k]) => SAFE_LOG_HEADERS.has(k.toLowerCase()))
                    )
                });
                if (request.headers.get('accept') === 'application/json') {
                    return json({message}, {status: 403});
                }
                return error(403, {message});
            }

            return {csrf_valid: true};
        }
};

export const CSRFChecker = {
    regex:
        (...oneOf: RegExp[]) =>
            (input: { url: URL }) =>
                oneOf.some((exp) => exp[Symbol.match](input.url.pathname)),
    list:
        (...oneOf: string[]) =>
            (input: { url: URL }) =>
                oneOf.includes(input.url.pathname)
};
