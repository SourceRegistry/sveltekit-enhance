import {randomUUID} from 'node:crypto';
import type {EnhanceInput} from "../index.js";

const CORRELATION_ID_HEADER = 'x-correlation-id';
const REQUEST_ID_HEADER = 'x-request-id';
const MAX_CORRELATION_ID_LENGTH = 128;
const SAFE_CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

const normalizeCorrelationId = (raw?: string | null) => {
    if (!raw) return undefined;
    const candidate = raw.trim();
    if (!candidate) return undefined;
    if (candidate.length > MAX_CORRELATION_ID_LENGTH) return undefined;
    if (!SAFE_CORRELATION_ID_PATTERN.test(candidate)) return undefined;
    return candidate;
};

const withCorrelationHeader = (response: Response, correlationId: string) => {
    try {
        response.headers.set(CORRELATION_ID_HEADER, correlationId);
        return response;
    } catch {
        const headers = new Headers(response.headers);
        headers.set(CORRELATION_ID_HEADER, correlationId);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
        });
    }
};


export type RequestCorrelationLocals = {
    correlation_id?: string;
    request_started_at?: string
}

export const RequestCorrelation = {
    header: CORRELATION_ID_HEADER,
    attach: (input: EnhanceInput<'handle'>) => {
        const correlationId =
            normalizeCorrelationId(input.request.headers.get(CORRELATION_ID_HEADER)) ??
            normalizeCorrelationId(input.request.headers.get(REQUEST_ID_HEADER)) ??
            randomUUID();

        if (input.locals) {
            // @ts-ignore
            input.locals['correlation_id'] = correlationId;
            // @ts-ignore
            input.locals['request_started_at'] = Date.now();
        }

        input.responseHandlers.push(({response}) => withCorrelationHeader(response, correlationId));
    }
};
