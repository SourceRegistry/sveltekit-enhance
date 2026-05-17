import type {EnhanceFunction, EnhanceInput} from "../index.js";
import type {Logger} from "./logger.js";

const durationMs = (startedAt: bigint) => Number(process.hrtime.bigint() - startedAt) / 1_000_000;

const resolveRoute = (event: EnhanceInput) =>
    event.route.id ?? event.url.pathname;

export type RequestTraceLocals = {
    trace?: {
        id: string
        started_at: bigint
    }
}

export type RecordTraceMetricEntry = {
    method: string,
    path: string,
    status: number,
    durationMs: number,
}


export type TraceOptions = {
    logger?: Logger
    record?: (entry: RecordTraceMetricEntry) => any
}

export const RequestMonitor = {
    trace: (options: TraceOptions = {}): EnhanceFunction<'handle'> => {
        const {
            logger = console,
            record,
        } = options

        return async (event: EnhanceInput<'handle'>) => {
            const locals = event.locals as App.Locals & RequestTraceLocals;
            const requestId = (locals as any).requestId ?? "unknown";
            const route = resolveRoute(event);

            locals.trace = {
                id: requestId,
                started_at: process.hrtime.bigint()
            };

            logger.debug("http.request.started", {
                request_id: requestId,
                method: event.request.method,
                route,
                client_ip: event?.getClientAddress?.()
            });

            try {
                const response = await event.resolve(event.event);
                if (!response)
                    return response;

                const elapsedMs = Number(durationMs(locals.trace!.started_at).toFixed(2));

                record?.({
                    method: event.request.method,
                    path: route,
                    status: response.status,
                    durationMs: elapsedMs,
                });

                const context = {
                    request_id: requestId,
                    method: event.request.method,
                    route,
                    status: response.status,
                    duration_ms: elapsedMs,
                    client_ip: event?.getClientAddress?.()
                };

                if (response.status >= 500) {
                    logger.error("http.request.completed", context);
                    return response;
                }

                if (response.status >= 400) {
                    logger.warn("http.request.completed", context);
                    return response;
                }

                logger.info("http.request.completed", context);
                return response;
            } catch (error) {
                const elapsedMs = Number(durationMs(locals.trace!.started_at).toFixed(2));
                record?.({
                    method: event.request.method,
                    path: route,
                    status: 500,
                    durationMs: elapsedMs,
                });
                logger.error("http.request.failed", {
                    request_id: requestId,
                    method: event.request.method,
                    route,
                    duration_ms: elapsedMs,
                    client_ip: event?.getClientAddress?.(),
                    error: error instanceof Error
                        ? {name: error.name, message: error.message}
                        : {value: String(error)}
                });
                throw error;
            }
        };
    }
}
