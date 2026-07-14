<div align="center">

# @sourceregistry/sveltekit-enhance

**Composable middleware, guards, and form utilities for SvelteKit**

[![npm version](https://img.shields.io/npm/v/@sourceregistry/sveltekit-enhance?style=flat-square&color=f96743)](https://www.npmjs.com/package/@sourceregistry/sveltekit-enhance)
[![npm downloads](https://img.shields.io/npm/dm/@sourceregistry/sveltekit-enhance?style=flat-square)](https://www.npmjs.com/package/@sourceregistry/sveltekit-enhance)
[![license](https://img.shields.io/npm/l/@sourceregistry/sveltekit-enhance?style=flat-square)](./LICENSE)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-%5E2.58-FF3E00?style=flat-square&logo=svelte&logoColor=white)](https://kit.svelte.dev)
[![issues](https://img.shields.io/github/issues/SourceRegistry/sveltekit-enhance?style=flat-square)](https://github.com/SourceRegistry/sveltekit-enhance/issues)

Wrap actions, loads, methods, and hooks with composable enhancers. Stack auth guards, feature flags, request tracing, and form parsing without touching SvelteKit's internals.

[Docs](https://sourceregistry.github.io/sveltekit-enhance/) · [npm](https://www.npmjs.com/package/@sourceregistry/sveltekit-enhance) · [Issues](https://github.com/SourceRegistry/sveltekit-enhance/issues)

</div>

---

## Installation

```sh
npm install @sourceregistry/sveltekit-enhance
```

**Peer dependency:** `@sveltejs/kit ^2.58.0`

---

## Overview

```ts
import { enhance, Auth, RequestCorrelation, RequestMonitor, Form } from '@sourceregistry/sveltekit-enhance';

// hooks.server.ts
export const handle = enhance.handle(
    async ({ event, resolve }) => resolve(event),
    RequestCorrelation.attach,
    RequestMonitor.trace({ logger: myLogger, record: metrics.record }),
);

// +server.ts
export const POST = enhance.method(
    async (event) => new Response(JSON.stringify(event.context)),
    Auth.Bearer,
    FeatureFlag.all('PUBLIC_API_ENABLED'),
);

// +page.server.ts
export const actions = {
    default: enhance.action(
        async (event) => {
            const name = event.context.form.string$('name');
            return success({ name });
        },
        Form.schema(myValidator),
    ),
};
```

---

## Core API

Import from `@sourceregistry/sveltekit-enhance`.

### `enhance.handle`

Wraps SvelteKit's `handle` hook. Enhancers run left-to-right before the handler; their return values are merged into `context`.

```ts
import { enhance } from '@sourceregistry/sveltekit-enhance';

// src/hooks.server.ts
export const handle = enhance.handle(
    async ({ event, resolve, context }) => resolve(event),
    enhancerA,
    enhancerB,
);
```

#### SSE / streaming responses

`enhance.handle` automatically detects Server-Sent Events and other streaming requests (via `Accept: text/event-stream`) and bypasses the main handler entirely — going straight to SvelteKit's `resolve`. This prevents the handler from blocking indefinitely on `await resolve(event)`, which never settles for a streaming response.

Consequences:
- The **main handler** does not run for SSE requests — it cannot inspect or modify the response headers.
- **`responseHandlers`** (added by enhancers via `contextInput.responseHandlers.push(...)`) are also skipped for responses with `Content-Type: text/event-stream`.
- **Enhancers** (the variadic context arguments) still run normally — they can set locals, authenticate the request, or short-circuit with an error response.

```ts
// This handler is skipped for SSE requests — no change needed on your end.
export const handle = enhance.handle(
    async ({ event, resolve }) => {
        const response = await resolve(event); // not called for SSE
        response.headers.set('x-custom', 'value');
        return response;
    },
    Auth.Bearer,       // still runs — can reject unauthorized SSE requests
    SessionGuard.hook, // still runs
);
```

If you need to set response headers on SSE routes, do it in the route handler itself (e.g. `+server.ts`) rather than in the `enhance.handle` main handler.

### `enhance.load`

Wraps server `load` functions.

```ts
// +page.server.ts
export const load = enhance.load(
    async (event) => ({ user: event.context.user }),
    Auth.Bearer,
);
```

### `enhance.action`

Wraps form actions.

```ts
// +page.server.ts
export const actions = {
    submit: enhance.action(
        async (event) => success(event.context),
        Auth.Bearer,
        Form.schema(myValidator),
    ),
};
```

### `enhance.method`

Wraps `+server.ts` endpoint handlers.

```ts
// +server.ts
export const GET = enhance.method(
    async (event) => new Response(JSON.stringify(event.context)),
    Auth.Bearer,
);
```

### Utilities

```ts
import { fail, error, success, not_good } from '@sourceregistry/sveltekit-enhance';

fail(400, { message: 'bad input' });   // throws ActionFailure — use inside actions
error(404, { message: 'not found' });  // throws HttpError
success({ id: 1 });                    // typed identity helper
not_good(input, 403);                  // delegates to fail or error based on callType
```

---

## Helpers

All helpers are available from `@sourceregistry/sveltekit-enhance` or `@sourceregistry/sveltekit-enhance/helpers`.

---

### `CSRF`

Blocks cross-site form submissions on mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) with form content types. Checks the `Origin` header against the request origin. Absent `Origin` (server-side fetch, curl) is allowed through. Returns `403` — JSON body when `Accept: application/json`, SvelteKit `error()` otherwise.

```ts
import { CSRF, CSRFChecker } from '@sourceregistry/sveltekit-enhance';

export const handle = enhance.handle(
    myHandler,
    CSRF.inspect(
        CSRFChecker.list('/api/webhooks/stripe'),  // bypass paths
        myLogger,                                   // optional, defaults to console
    ),
);
```

Built-in bypass checkers:

| Checker | Description |
|---------|-------------|
| `CSRFChecker.list(...paths)` | Exact pathname match |
| `CSRFChecker.regex(...patterns)` | RegExp match against pathname |

Custom checker — any `(input: EnhanceInput) => MaybePromise<boolean>`:
```ts
// true = bypass CSRF check
CSRF.inspect((input) => input.url.pathname.startsWith('/api/public'))
```

Returns `{ csrf_valid: true }` on pass. Locals set: none.

---

### `Auth`

Extracts and validates `Authorization: Bearer <token>` headers.

```ts
import { Auth } from '@sourceregistry/sveltekit-enhance';

export const GET = enhance.method(
    async (event) => new Response(event.context.token),
    Auth.Bearer,
);
```

Returns `{ token: string }`. Throws `401` if the header is missing or malformed.

---

### `Devtools`

Silences Chrome DevTools probe requests (`/.well-known/appspecific/com.chrome.devtools.json`) with a `204 No Content`. Logs in `dev` mode.

```ts
import { Devtools } from '@sourceregistry/sveltekit-enhance';

export const handle = enhance.handle(myHandler, Devtools.ignore);
```

---

### `FeatureFlag`

Guards routes behind SvelteKit public env vars (`$env/dynamic/public`). Always passes in `dev` mode.

```ts
import { FeatureFlag } from '@sourceregistry/sveltekit-enhance';

// All listed flags must be enabled
FeatureFlag.all('PUBLIC_FEATURE_A', 'PUBLIC_FEATURE_B')

// At least one flag must be enabled
FeatureFlag.oneOf('PUBLIC_FEATURE_A', 'PUBLIC_FEATURE_B')
```

Truthy values: `true`, `TRUE`, `on`, `ON`, `1`. Returns `{ flags }` or throws `503 Feature not enabled`.

---

### `RequestCorrelation`

Propagates a correlation ID across the request/response cycle.

- Reads `x-correlation-id` or `x-request-id` from incoming headers
- Validates: max 128 chars, pattern `[A-Za-z0-9._:-]+`
- Generates a UUID v4 if absent
- Echoes the ID back via `x-correlation-id` response header

```ts
import { RequestCorrelation } from '@sourceregistry/sveltekit-enhance';

export const handle = enhance.handle(myHandler, RequestCorrelation.attach);
```

| Local | Type | Description |
|-------|------|-------------|
| `correlation_id` | `string` | Resolved correlation ID |
| `request_started_at` | `number` | `Date.now()` at attach time |

---

### `RequestMonitor`

Structured HTTP request logging and optional metrics collection. Instruments the full lifecycle: start, completion (log level by status), and unhandled errors — all with elapsed duration.

```ts
import { RequestMonitor } from '@sourceregistry/sveltekit-enhance';

export const handle = enhance.handle(
    myHandler,
    RequestCorrelation.attach,
    RequestMonitor.trace({
        logger: myLogger,        // optional, defaults to console
        record: metrics.record,  // optional
    }),
);
```

#### `TraceOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `logger` | `TraceLogger` | `console` | Must implement `debug`, `info`, `warn`, `error` |
| `record` | `(entry: RecordTraceMetricEntry) => any` | — | Called after every request |

#### Log events

| Event | Level | Condition |
|-------|-------|-----------|
| `http.request.started` | `debug` | Before resolve |
| `http.request.completed` | `info` | `status < 400` |
| `http.request.completed` | `warn` | `status 4xx` |
| `http.request.completed` | `error` | `status 5xx` |
| `http.request.failed` | `error` | Unhandled throw |

#### Types

```ts
type RecordTraceMetricEntry = { method: string; path: string; status: number; durationMs: number }
type TraceLogger            = { debug(...args: any[]): any; info(...args: any[]): any; warn(...args: any[]): any; error(...args: any[]): any }
```

Locals set: `trace: { id: string; started_at: bigint }`.

---

### `StartUp`

Gates request handling until app-startup work (DB connect, cache warm, etc.) resolves. Requests during startup get a `503` (JSON) or redirect to a startup page (HTML), both with `Retry-After: 4`. Any rejected startup item calls `onFailure` (defaults to logging + `process.exit(1)`).

```ts
import { StartUp, Deferred } from '@sourceregistry/sveltekit-enhance';

const dbReady = Deferred.Derive(db.connect());

export const handle = enhance.handle(
    myHandler,
    StartUp.await([dbReady], {
        showPage: '/startup',       // HTML requests are redirected here while not ready
        showJSON: { error: 'service_starting', message: 'Application is initializing' },
        allowedPaths: ['/health'],  // always allowed through, in addition to showPage
    }),
);
```

#### `StartupConfiguration`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `showPage` | `string` | `/startup` | Path HTML requests are redirected to while not ready; always allowed through |
| `showJSON` | `Record<string, any>` | `{ error: 'service_starting', message: 'Application is initializing' }` | Body returned for non-HTML requests |
| `allowedPaths` | `string[]` | `[]` | Extra paths allowed through before startup completes |
| `onFailure` | `(reason: unknown) => void` | logs to stderr + `process.exit(1)` | Called when a startup item rejects |

`waitOn` accepts `Deferred` instances or plain `Promise`s (wrapped via `Deferred.Derive`).

---

### `CacheControl`

Sets `Cache-Control` response headers. Provides named directive helpers so policies are readable at a glance, and two enhancers — one for broad handle-level rules, one for per-route load-level overrides.

```ts
import { CacheControl, directive } from '@sourceregistry/sveltekit-enhance';

// hooks.server.ts — apply rules globally
export const handle = enhance.handle(
    myHandler,
    CacheControl.global(
        { match: /^\/api\//, directive: directive.noStore },
        { match: /^\/blog\//, directive: directive.public(300, 60) },
    ),
);

// +page.server.ts — override for a specific route
export const load = enhance.load(
    async (event) => event.context,
    CacheControl.local(directive.public(3600)),
);
```

`directive` is also exported as a standalone named export — shorthand for `CacheControl.directive` when you only need to reference directives without the enhancers.

#### `CacheControl.global(...rules)`

Handle-level enhancer. Iterates the rule list and sets `Cache-Control` via `setHeaders()` for the first matching pathname. When no rule matches, the header is left unset.

| Param | Type | Description |
|-------|------|-------------|
| `...rules` | `CacheRule[]` | Ordered list of `{ match, directive }` pairs. First match wins. |

> Runs in `handle` context only. Add a catch-all rule (`match: () => true`) if you want a guaranteed fallback.

#### `CacheControl.local(directive)`

Load-level enhancer. Sets `Cache-Control` for the current route via `setHeaders()`. Use this to override a global rule for a specific page.

| Param | Type | Description |
|-------|------|-------------|
| `directive` | `CacheDirective` | The directive string to apply. |

#### `CacheControl.directive`

Named helpers that produce correctly-formatted `Cache-Control` strings.

| Helper | Directive | When to use |
|--------|-----------|-------------|
| `noStore` | `no-store` | Sensitive data — never cache (user dashboards, auth responses) |
| `noCache` | `no-cache` | Changes frequently but supports conditional GETs (ETags / Last-Modified) |
| `noCacheNoStore` | `no-cache, no-store, must-revalidate` | Belt-and-suspenders; also covers legacy HTTP/1.0 proxies |
| `public(maxAge, swr?)` | `public, max-age=N[, stale-while-revalidate=N]` | Publicly cacheable content; `swr` serves stale while revalidating in the background |
| `private(maxAge)` | `private, max-age=N` | Personalised content — browser cache only, not CDNs or shared proxies |

---

### `Form`

Typed, ergonomic FormData extraction. Works standalone or as an enhancer.

#### As an enhancer — `Form.schema`

Validates and deserializes form data via a `Validator<T>` before the handler runs.

```ts
import { Form, enhance, success } from '@sourceregistry/sveltekit-enhance';

export const actions = {
    default: enhance.action(
        async (event) => success(event.context.form.result),
        Form.schema(myValidator),
    ),
};
```

#### Standalone — `Form.handle`

```ts
import { Form } from '@sourceregistry/sveltekit-enhance';

await Form.handle(request, ({ form }) => {
    const name = form.string$('name');
    const age  = form.number('age');
    return { name, age };
});
```

#### Field extractors

Optional variants return `undefined` when the field is absent. Required variants (`$` suffix) throw `fail(400)`.

| Method | Returns | Notes |
|--------|---------|-------|
| `string(name)` / `string$(name)` | `string \| null \| undefined` | |
| `pattern$(name, pattern)` | `string` | `RegExp` or pattern string |
| `number(name)` / `number$(name)` | `number \| undefined` | |
| `boolean(name)` / `boolean$(name)` | `boolean \| undefined` | Accepts `true/false`, `1/0`, `on/off` |
| `date(name, parser?)` / `date$(name, parser)` | `Date \| undefined` | Custom parser supported |
| `json<T>(name, transformer?)` / `json$(name)` | `T \| undefined` | Optional transform fn |
| `jsond(options)` | `any` | All FormData → nested object via dot-notation keys |
| `file(name)` / `file$(name)` | `File \| null \| undefined` | |
| `files(name)` | `File[]` | Non-empty, named files only |
| `fileRecord(prefix, removePrefix?)` | `Record<string, File[]>` | Groups files by key prefix |
| `array<T>(name, mapper?)` / `array$(name)` | `T[] \| undefined` | |
| `enum(name, Enum)` / `enum$(name, Enum)` | `keyof E \| undefined` | |
| `record(options?)` | `Record<string, any>` | All entries; optional `filter` / `transformer` |
| `validate(schema, options?)` | `T` | Runs `Validator<T>`, throws `fail(400)` on failure |

#### Conditional helpers

```ts
form.onlyIf(condition, trueVal, falseVal?)
form.onlyIfPresent(key, (entry) => ..., fallback?)
form.onlyIfArrayPresent(key, (entries) => ..., fallback)
form.selector({ fieldName: (entry, key) => ..., $default?, $error? })
form.selector$({ ... })    // throws fail(400) if no case matches
form.basedOn(val, processor)
form.process(name, parser, processor)
```

#### Standalone functions

All `FormContext` methods are also exported as standalone functions taking `FormData` as the first argument, plus:

```ts
arrayString(formdata, name, delimiter, mapper?)
hasOneOf(formdata, names)
reviver(key, value)   // JSON.parse reviver — coerces strings to typed primitives
```

---

## Type Reference

```ts
// Core
EnhanceInput<CallType>     // event passed to all enhancers — includes all RequestEvent properties:
                           //   cookies, fetch, locals, params, request, route, url
                           //   setHeaders(headers)      — set response headers (no set-cookie; use cookies API)
                           //   isDataRequest            — true when client fetches +page/layout.server.js data
                           //   isSubRequest             — true for same-origin server-side fetch (no HTTP round-trip)
                           //   isRemoteRequest          — true when request comes from a remote function
                           //   tracing                  — OpenTelemetry spans (no-ops when tracing disabled; since SK 2.31)
                           //   + handle: resolve, event, responseHandlers
                           //   + load:   parent, depends, untrack
EnhanceFunction<CallType>  // (event: EnhanceInput) => MaybePromise<object | Response>
EnhanceHandle              // final handle fn — ({ event, resolve, context }) => MaybePromise<Response>
EnhanceLoad                // final load fn
EnhanceAction              // final action fn
EnhanceMethod              // final method fn
MaybePromise<T>            // T | Promise<T>

// Form
Validator<T>               // (value: unknown, path?: ValidationPath) => ValidationResult<T>
ValidationResult<T>        // { success: true; data: T } | { success: false; errors: ValidationIssue[] }
ValidationIssue            // { path: string; message: string; code?: string }
FormContext                // fluent API returned by Form.enhance / Form.handle
InferValidator<V>          // infers T from Validator<T>

// Helpers
TraceLogger                // { debug, info, warn, error }
TraceOptions               // { logger?: TraceLogger; record?: (entry) => any }
RecordTraceMetricEntry     // { method: string; path: string; status: number; durationMs: number }
RequestTraceLocals         // { trace?: { id: string; started_at: bigint } }
RequestCorrelationLocals   // { correlation_id?: string; request_started_at?: number }
CSRFChecker                // { regex(...patterns): checker; list(...paths): checker }
CacheDirective             // union of valid Cache-Control strings (+ open string & {})
CacheRule                  // { match: RegExp | ((pathname) => boolean); directive: CacheDirective }
```

---

## License

[Apache-2.0](./LICENSE) © [A.P.A. Slaa](https://github.com/SourceRegistry)
