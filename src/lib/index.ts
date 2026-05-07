import {
    type Action,
    type ActionResult,
    type Cookies,
    error as SError,
    fail as SFail,
    type Handle, isActionFailure,
    isHttpError,
    isRedirect,
    type RequestEvent,
    type ResolveOptions,
    type ServerLoadEvent
} from '@sveltejs/kit';

import type {RouteId as AppRouteId, LayoutParams as AppLayoutParams} from '$app/types'

export type MaybePromise<T> = T | Promise<T>;

export type EnhanceErrorHandler = <T = any>(err: unknown) => MaybePromise<T | Response | undefined | never | void>;
export type EnhanceResponseHandler = (input: {
    event: RequestEvent;
    response: Response;
}) => MaybePromise<unknown>;

export type EnhanceCallType = 'handle' | 'load' | 'method' | 'action';


export type EnhanceInput<
    CallType extends EnhanceCallType = EnhanceCallType,
    Params extends AppLayoutParams<'/'> = AppLayoutParams<'/'>,
    RouteId extends AppRouteId | string | null = AppRouteId | string | null,
    ParentData extends Record<string, any> = Record<string, any>
> = {
    cookies: Cookies;
    params: Params;
    route: { id: RouteId };
    url: URL;
    locals: App.Locals;
    request: Request;
    callType: CallType;
    fetch: typeof fetch;
    get errorHandlers(): EnhanceErrorHandler[];
} & (CallType extends 'handle'
    ? {
        get responseHandlers(): EnhanceResponseHandler[];
        resolve: (event?: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
        readonly event: RequestEvent;
    }
    : CallType extends 'load'
        ? {
            // @ts-expect-error relax the route_id when integrating with libraries
            parent: ServerLoadEvent<Params, ParentData, RouteId>['parent'];
            // @ts-expect-error relax the route_id when integrating with libraries
            depends: ServerLoadEvent<Params, ParentData, RouteId>['depends'];
            // @ts-expect-error relax the route_id when integrating with libraries
            untrack: ServerLoadEvent<Params, ParentData, RouteId>['untrack'];
        }
        : object);

export type EnhanceFunction<
    CallType extends EnhanceCallType = EnhanceCallType,
    Params extends AppLayoutParams<'/'> = AppLayoutParams<'/'>,
    RouteId extends AppRouteId | string | null = AppRouteId | string | null,
    EnhanceReturn = any
> = (event: EnhanceInput<CallType, Params, RouteId>) => MaybePromise<EnhanceReturn>;

export type EnhanceAction<
    Params extends AppLayoutParams<'/'>,
    OutputData extends Record<string, any> | void,
    RouteId extends AppRouteId | string | null,
    EnhanceReturn extends ActionResult | never | any = ActionResult
    // @ts-expect-error relax the route_id when integrating with libraries
> = (event: RequestEvent<Params, RouteId> & { context: EnhanceReturn }) => MaybePromise<OutputData>;

export type EnhanceLoad<
    Params extends AppLayoutParams<'/'> = AppLayoutParams<'/'>,
    ParentData extends Record<string, any> = Record<string, any>,
    OutputData extends Record<string, any> | void = Record<string, any> | void,
    RouteId extends AppRouteId | null = AppRouteId | null,
    EnhanceReturn extends never | any = any
> = (
    event: ServerLoadEvent<Params, ParentData, RouteId> & { context: EnhanceReturn }
) => MaybePromise<OutputData>;

export type EnhanceHandle<EnhanceReturn extends never | any = any> = (
    input: {
        event: RequestEvent;
        resolve(event: RequestEvent, opts?: ResolveOptions): MaybePromise<Response>;
    } & { context: EnhanceReturn }
) => MaybePromise<Response>;

const EnhanceErrorHandle = async (e: unknown, contextInput: EnhanceInput) => {
    if (isRedirect(e) || isHttpError(e)) {
        throw e;
    } else if (contextInput.callType === 'action' && isActionFailure(e)) {
        return e;
    } else if (e instanceof Response) {
        return e;
    } else if (e instanceof Promise) {
        return e;
    }
    for (const errorHandler of contextInput.errorHandlers) {
        try {
            await errorHandler(e);
        } catch (e) {
            if (typeof e === 'function') {
                return e();
            }
            throw e;
        }
    }
    throw e;
};

export type EnhanceMethod<
    Params extends AppLayoutParams<'/'> = AppLayoutParams<'/'>,
    RouteId extends AppRouteId | null = AppRouteId | null,
    EnhanceReturn extends never | any = any
> = (event: RequestEvent<Params, RouteId> & { context: EnhanceReturn }) => MaybePromise<Response>;

export const action =
    <
        Params extends AppLayoutParams<'/'> = AppLayoutParams<'/'>,
        OutputData extends Record<string, any> | void = Record<string, any> | void,
        RouteId extends AppRouteId | string | null = AppRouteId | string | null,
        const Enhances extends readonly EnhanceFunction<'action', Params, RouteId, object>[] = readonly EnhanceFunction<
            'action',
            Params,
            RouteId,
            object
        >[],
        EnhanceReturn extends ConcatReturnTypes<Enhances> = ConcatReturnTypes<Enhances>
    >(
        action: EnhanceAction<Params, OutputData, RouteId, EnhanceReturn>,
        ...enhances: [...Enhances]
        // @ts-expect-error relax the route_id when integrating with libraries
    ): Action<Params, OutputData, RouteId> =>
        // @ts-expect-error relax the route_id when integrating with libraries
        async (event: RequestEvent<Params, RouteId>): Promise<OutputData> => {
            let combined: EnhanceReturn = {} as EnhanceReturn;
            // @ts-expect-error relax the route_id when integrating with libraries
            const input: EnhanceInput<'action', Params, RouteId> & RequestEvent<Params, RouteId> =
                Object.assign(event, {
                    __errorHandlers__: [] as EnhanceErrorHandler[],
                    isAction: false,
                    callType: 'action',
                    get errorHandlers() {
                        return this.__errorHandlers__;
                    }
                } as any);
            for (const enhancer of enhances) {
                try {
                    const result = await enhancer(input);
                    combined = Object.assign(combined, result);
                } catch (e) {
                    return EnhanceErrorHandle(e, input);
                }
            }
            try {
                return await action(Object.assign(input, {context: combined}));
            } catch (e) {
                return EnhanceErrorHandle(e, input);
            }
        };
export const load = <
    Params extends AppLayoutParams<'/'> = AppLayoutParams<'/'>,
    ParentData extends Record<string, any> = Record<string, any>,
    OutputData extends Record<string, any> | void = Record<string, any> | void,
    RouteId extends AppRouteId | null = AppRouteId | null,
    const Enhances extends readonly EnhanceFunction<'load', Params, RouteId, object>[] = readonly EnhanceFunction<
        'load',
        Params,
        RouteId,
        object
    >[],
    EnhanceReturn extends ConcatReturnTypes<Enhances> = ConcatReturnTypes<Enhances>
>(
    load: EnhanceLoad<Params, ParentData, OutputData, RouteId, EnhanceReturn>,
    ...contexts: [...Enhances]
) => {
    return async (event: ServerLoadEvent<Params, ParentData, RouteId>): Promise<OutputData> => {
        let combined: EnhanceReturn = {} as EnhanceReturn;
        const contextInput: EnhanceInput<'load', Params, RouteId> &
            ServerLoadEvent<Params, ParentData, RouteId> = Object.assign(event, {
            __errorHandlers__: [] as EnhanceErrorHandler[],
            isAction: false,
            callType: 'load',
            get errorHandlers() {
                return this.__errorHandlers__;
            }
        } as any);
        for (const context of contexts) {
            try {
                const result = await context(contextInput);
                combined = Object.assign(combined, result);
            } catch (e) {
                return EnhanceErrorHandle(e, contextInput);
            }
        }
        try {
            return load(Object.assign(contextInput, {context: combined}));
        } catch (e) {
            return EnhanceErrorHandle(e, contextInput);
        }
    };
};

export const method = <
    Params extends AppLayoutParams<'/'> = AppLayoutParams<'/'>,
    RouteId extends AppRouteId | string | null = AppRouteId | string | null,
    const Enhances extends readonly EnhanceFunction<'method', Params, RouteId, object>[] = readonly EnhanceFunction<
        'method',
        Params,
        RouteId,
        object
    >[],
    EnhanceReturn extends Awaited<ConcatReturnTypes<Enhances>> = Awaited<ConcatReturnTypes<Enhances>>
>(
    // @ts-expect-error this is to relax the typing around external integrations
    handle: EnhanceMethod<Params, RouteId, EnhanceReturn>,
    ...contexts: [...Enhances]
) => {
    // @ts-expect-error this is to relax the typing around external integrations
    return async (event: RequestEvent<Params, RouteId>): Promise<Response> => {
        let combined: EnhanceReturn = {} as EnhanceReturn;
        // @ts-expect-error this is to relax the typing around external integrations
        const contextInput: EnhanceInput<'method', Params, RouteId> & RequestEvent<Params, RouteId> =
            Object.assign(event, {
                __errorHandlers__: [] as EnhanceErrorHandler[],
                isAction: false,
                callType: 'method',
                get errorHandlers() {
                    return this.__errorHandlers__;
                }
            } as any);
        for (const context of contexts) {
            try {
                const result = await context(contextInput);
                combined = Object.assign(combined, result);
            } catch (e) {
                return EnhanceErrorHandle(e, contextInput);
            }
        }
        try {
            return await handle(Object.assign(contextInput, {context: combined}));
        } catch (e) {
            return EnhanceErrorHandle(e, contextInput);
        }
    };
};

export const handle = <
    const Enhances extends readonly EnhanceFunction<'handle'>[] = readonly EnhanceFunction<'handle'>[],
    EnhanceReturn extends Awaited<ConcatReturnTypes<Enhances>> = Awaited<ConcatReturnTypes<Enhances>>
>(
    handle: EnhanceHandle<EnhanceReturn>,
    ...contexts: [...Enhances]
): Handle => async (input): Promise<Response> => {
    let combined: EnhanceReturn = {} as EnhanceReturn;
    let resolved = false;
    const contextInput: EnhanceInput<'handle'> & RequestEvent & {
        get responseHandlers(): EnhanceResponseHandler[];
    } = Object.assign(input.event, {
        __errorHandlers__: [] as EnhanceErrorHandler[],
        __responseHandler__: [] as EnhanceResponseHandler[],
        isAction: false,
        callType: 'handle',
        get errorHandlers() {
            return this.__errorHandlers__;
        },
        get responseHandlers() {
            return this.__responseHandler__;
        },
        resolve: (event: RequestEvent = input.event, opts?: ResolveOptions) => {
            resolved = true;
            return apply_handle(contexts.length, event, opts);
        },
        get event() {
            return input.event;
        }
    } as any);

    const merge_options = (
        parent_options: ResolveOptions | undefined,
        options: ResolveOptions | undefined
    ): ResolveOptions => {
        const transformPageChunk: ResolveOptions['transformPageChunk'] = async ({html, done}) => {
            if (options?.transformPageChunk) {
                html = (await options.transformPageChunk({html, done})) ?? '';
            }

            if (parent_options?.transformPageChunk) {
                html = (await parent_options.transformPageChunk({html, done})) ?? '';
            }

            return html;
        };

        return {
            transformPageChunk,
            filterSerializedResponseHeaders:
                parent_options?.filterSerializedResponseHeaders ??
                options?.filterSerializedResponseHeaders,
            preload: parent_options?.preload ?? options?.preload
        };
    };

    const apply_handle = async (
        i: number,
        event: RequestEvent,
        parent_options?: ResolveOptions
    ): Promise<Response> => {
        if (i < contexts.length) {
            const context = contexts[i];
            const previous_resolve = contextInput.resolve;
            contextInput.resolve = (next_event: RequestEvent = event, options?: ResolveOptions) => {
                resolved = true;
                return apply_handle(i + 1, next_event, merge_options(parent_options, options));
            };

            try {
                resolved = false;
                const result = await context(contextInput);
                if (result instanceof Response) return result;
                if (resolved) {
                    throw new Error('enhance.handle context called resolve but did not return its response');
                }
                combined = Object.assign(combined, result);
                return apply_handle(i + 1, event, parent_options);
            } catch (e) {
                return EnhanceErrorHandle(e, contextInput) as Promise<Response>;
            } finally {
                contextInput.resolve = previous_resolve;
            }
        }

        try {
            return await handle(
                {
                    ...input,
                    context: combined,
                    event,
                    resolve: (next_event: RequestEvent, options?: ResolveOptions) =>
                        input.resolve(next_event, merge_options(parent_options, options))
                }
            );
        } catch (e) {
            return EnhanceErrorHandle(e, contextInput) as Promise<Response>;
        }
    };

    try {
        const response = await apply_handle(0, input.event);
        if (contextInput.responseHandlers.length > 0) {
            for (const responseHandler of contextInput.responseHandlers) {
                await responseHandler({event: contextInput, response});
            }
        }
        return response;
    } catch (e) {
        return EnhanceErrorHandle(e, contextInput);
    }
};

export const enhance = {
    action,
    load,
    method,
    handle
};

export type Enhancers<
    Params extends AppLayoutParams<'/'> = AppLayoutParams<'/'>,
    RouteId extends AppRouteId | null = AppRouteId | null,
    EnhanceReturn extends never | any = any
> = Record<string, EnhanceFunction<EnhanceCallType, Params, RouteId, EnhanceReturn>>;

export type Func = (...args: any[]) => any;

export type ConcatReturnTypes<T extends readonly Func[]> = T extends readonly []
    ? Record<never, never>
    : T extends readonly [infer First, ...infer Rest]
        ? First extends Func
            ? Awaited<ReturnType<First>> &
            ConcatReturnTypes<Rest extends readonly Func[] ? Rest : []>
            : Record<never, never>
        : Record<never, never>;

export const fail = <T extends Record<string, unknown> | undefined = undefined>(
    status: number,
    data: T
): never => {
    throw SFail(status, data);
};

export const error = (
    status: number,
    body?: { message: string } extends App.Error ? App.Error | string | undefined : never
): never => SError(status, body);

export const success = <T extends Record<string, unknown> | undefined = undefined>(data: T) => data;

export function not_good(
    input: { callType: EnhanceInput['callType'] },
    status: number,
    arg?: App.Error | string | Record<string, unknown> | undefined
) {
    // Based on callType, call the appropriate function.
    return (input.callType === 'action' ? fail : error)(status, arg as any);
}

export * from './helpers/index.js'
