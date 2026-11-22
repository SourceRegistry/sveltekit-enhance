<div align="center">

# @sourceregistry/sveltekit-enhance

**Composable middleware, guards, and form utilities for SvelteKit**

[![npm version](https://img.shields.io/npm/v/@sourceregistry/sveltekit-enhance?style=flat-square&color=f96743)](https://www.npmjs.com/package/@sourceregistry/sveltekit-enhance)
[![npm downloads](https://img.shields.io/npm/dm/@sourceregistry/sveltekit-enhance?style=flat-square)](https://www.npmjs.com/package/@sourceregistry/sveltekit-enhance)
[![license](https://img.shields.io/npm/l/@sourceregistry/sveltekit-enhance?style=flat-square)](./LICENSE)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-3-FF3E00?style=flat-square&logo=svelte&logoColor=white)](https://svelte.dev/docs/kit)
[![issues](https://img.shields.io/github/issues/SourceRegistry/sveltekit-enhance?style=flat-square)](https://github.com/SourceRegistry/sveltekit-enhance/issues)

Wrap actions, loads, methods, and hooks with composable enhancers. Stack auth guards, feature flags, request tracing, and form parsing without touching SvelteKit's internals.

[Docs](https://sourceregistry.github.io/sveltekit-enhance/) · [npm](https://www.npmjs.com/package/@sourceregistry/sveltekit-enhance) · [Issues](https://github.com/SourceRegistry/sveltekit-enhance/issues)

</div>

---

## Installation

```sh
npm install @sourceregistry/sveltekit-enhance
```

**Peer dependency:** `@sveltejs/kit ^3.0.1`

---

## Overview

```ts
import { enhance, Auth, FeatureFlag, RequestCorrelation, RequestMonitor, Form, success } from '@sourceregistry/sveltekit-enhance';

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

An enhancer can bypass all remaining enhancers and the custom handler while still resolving the request through SvelteKit's normal routing with `resolveToRoute`:

```ts
export const handle = enhance.handle(
    async ({ event, resolveToRoute }) => {
        if (event.url.pathname === '/healthz') {
            return resolveToRoute(event);
        }
    },
    enhancerA,
    enhancerB,
);
```

`resolveToRoute` invokes SvelteKit's native resolver, so the matching page or `+server.ts` endpoint still runs and normal headers and cookies are preserved. It skips the remaining `enhance.handle` enhancers and the custom handler. `resolve` continues through the remaining enhancers as usual. `resolveToRoute` may also be thrown when integrating with code that uses exception-based control flow.

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

Blocks cross-site form submissions on mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) with form content types. Checks the `Origin` header against the request origin. Absent `Origin` (server-side fetch, curl) is allowed through, like SvelteKit's own check: the protection targets browsers, which always send `Origin` on cross-site form posts. Returns `403` — JSON body when the `Accept` header lists `application/json` (including multi-value headers such as `application/json, text/plain, */*`), SvelteKit `error()` otherwise.

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

Returns `{ token: string }`. The scheme must be `Bearer` (case-insensitive) followed by a single token; any other scheme (`Basic`, `Token`, ...), a missing header or extra segments throw `401`.

---

### `Devtools`

Silences Chrome DevTools probe requests (`/.well-known/appspecific/com.chrome.devtools.json`) with a `204 No Content`. Logs in `dev` mode.

```ts
import { Devtools } from '@sourceregistry/sveltekit-enhance';

export const handle = enhance.handle(myHandler, Devtools.ignore);
```

---

### `FeatureFlag`

Guards routes behind SvelteKit public env vars (`$app/env/public`). Declare each flag
with `public: true` in your app's `src/env.ts`.

> **Dev bypass:** when SvelteKit's `dev` is `true`, every flag check passes (`FeatureFlag.all`, `FeatureFlag.oneOf`, and the experimental `isEnabled` / `is`; `isDisabled` is `true` in dev for the same reason). This is for local development only; production builds evaluate the real env values. Never use feature flags as an authorization mechanism.

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

Locals set: `trace: { id: string; started_at: bigint }` (`started_at` is a monotonic nanosecond reading from `performance.now()`, not wall-clock time).

Logging hygiene: the logged `url` contains origin and pathname only; the query string and hash are dropped because they commonly carry tokens. Inbound `x-correlation-id` / `x-request-id` values are validated like `RequestCorrelation` (unsafe values are ignored and a UUID is generated). Only runtime-neutral APIs (`performance.now`, `globalThis.crypto`) are used, so it works on edge adapters as well as Node.

---

### `RequestRateLimit`

Fixed-window rate limiting per rule and client. Throws a `429` JSON response (with `Retry-After` and `x-ratelimit-*` headers) once a client exceeds `limit` requests per `windowMs`; allowed responses get the `x-ratelimit-*` headers.

```ts
import { RequestRateLimit } from '@sourceregistry/sveltekit-enhance';

export const handle = enhance.handle(
    myHandler,
    RequestRateLimit({
        rules: [
            { id: 'login', pattern: /^\/login$/, methods: ['POST'], limit: 5, windowMs: 60_000 },
            { id: 'api', pattern: /^\/api\//, limit: 100, windowMs: 60_000 },
        ],
        // Only needed when the adapter's getClientAddress() is unavailable and you sit behind your own proxies:
        trustProxyHeaders: true,
        trustedProxyHops: 1,
    }).inspect,
);
```

| Option | Default | Description |
|--------|---------|-------------|
| `rules` | required | Ordered `{ id, pattern, methods?, limit, windowMs }`; first match wins |
| `store` | in-memory | `RateLimitStore` (`increment(key, windowMs, now)`); supply a shared store (Redis, ...) for multi-instance deployments |
| `clientIdentifier` | `getClientAddress()` | Custom key, e.g. user id or API key |
| `trustProxyHeaders` | `false` | Fall back to `x-forwarded-for` / `x-real-ip` when `getClientAddress()` throws. Those headers are client-controlled; enable only behind proxies that overwrite them |
| `trustedProxyHops` | `1` | Number of trusted proxies; the Nth address from the right of `x-forwarded-for` is used |
| `correlationHeader` / `correlationId` | none | Echo a correlation id on rate-limit responses |
| `logger` | none | Receives `request.rate_limited` warnings |

`createMemoryRateLimitStore({ cleanupIntervalMs?, maxKeys? })` is bounded (`maxKeys`, default 10 000: expired buckets are purged, then the oldest is evicted). Buckets are per process, so multi-instance deployments under-count without a shared store. With no resolvable client address, unidentified requests share one `unknown` bucket.

`ClientIp(defaults?)` (also exported) exposes the parsing used for the fallback: `fromRequest(request, { trustProxyHeaders, trustedProxyHops })` and `fromForwardedFor(header, hops)`. `x-real-ip` is only consulted when `x-forwarded-for` is absent.

---

### `StartUp`

Gates request handling until app-startup work (DB connect, cache warm, etc.) resolves. Requests during startup get a `503` — JSON body for non-HTML requests, or `showPage`'s rendered HTML for HTML requests — both with `Retry-After: 4`. Once ready, `showPage` itself redirects to `readyRedirect` (so a plain Svelte page with no server guard can't be visited after startup completes) — disabled in dev so you can still preview the page. Any rejected startup item calls `onFailure` (defaults to logging + `process.exit(1)`).

```ts
import { StartUp, Deferred } from '@sourceregistry/sveltekit-enhance';

const dbReady = Deferred.Derive(db.connect());

export const handle = enhance.handle(
    myHandler,
    StartUp.await([dbReady], {
        showPage: '/startup',       // HTML requests are redirected here while not ready
        showJSON: { error: 'service_starting', message: 'Application is initializing' },
        allowedPaths: ['/health'],  // always allowed through, in addition to showPage
        readyRedirect: '/',         // where showPage redirects to once ready
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
| `readyRedirect` | `string` | `/` | Where `showPage` 302-redirects to once ready |

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

Handle-level enhancer. Finds the first rule matching the pathname and applies its directive as a **default** on the final response: if the response already has a `cache-control` header (for example from `CacheControl.local` or a route's own `setHeaders`), that header wins and nothing throws. When no rule matches, the header is left unset.

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

The first argument may be a `Request` (must have a form `Content-Type`, otherwise `fail(400)`), a `FormData`, or a `Promise<FormData>`.

#### Field extractors

Optional variants return `undefined` when the field is absent. Required variants (`$` suffix) throw `fail(400)`.

| Method | Returns | Notes |
|--------|---------|-------|
| `string(name)` / `string$(name)` | `string \| null \| undefined` | |
| `pattern$(name, pattern)` | `string` | `RegExp` or pattern string |
| `number(name)` / `number$(name)` | `number \| undefined` | Empty or whitespace-only gives `undefined`; non-numeric throws `fail(400)` |
| `boolean(name)` / `boolean$(name)` | `boolean \| undefined` | Accepts `true/false`, `1/0`, `on/off` |
| `date(name, parser?)` / `date$(name, parser)` | `Date \| undefined` | Custom parser supported; an invalid date throws `fail(400)` |
| `json<T>(name, transformer?)` / `json$(name)` | `T \| undefined` | Optional transform fn |
| `jsond(options)` | `any` | All FormData → nested object via dot-notation keys. Keys with a `__proto__`, `constructor` or `prototype` segment, and nested keys that collide with an existing scalar (`a=1` + `a.b=2`), are ignored |
| `file(name)` / `file$(name)` | `File \| null \| undefined` | |
| `files(name)` | `File[]` | Non-empty, named files only |
| `fileRecord(prefix, removePrefix?)` | `Record<string, File[]>` | Groups files by key prefix |
| `array<T>(name, mapper?)` / `array$(name)` | `T[] \| undefined` | |
| `enum(name, Enum)` / `enum$(name, Enum)` | `keyof E \| undefined` | |
| `record(options?)` | `Record<string, any>` | All entries; optional `filter` / `transformer` |
| `validate(schema, options?)` | `T` | Runs `Validator<T>`, throws `fail(400)` with `targets` (flat list of invalid paths). Values are revived (see below) unless you pass `options.transform` |

#### Value coercion (`reviver`): read this before using `validate` / `Form.schema`

`validate`, `Form.schema` and `json` / `json$` pass every **string** value through `reviver`, which converts:

| Input string | Becomes |
|--------------|---------|
| `"true"` / `"false"` | boolean |
| `"null"` / `"undefined"` | `null` / `undefined` |
| `"NaN"`, `"Infinity"`, `"-Infinity"` | number |
| `"1234"`, `"-1.5"`, `"0.5"` (canonical decimal numbers that print back identically) | number |
| `"007"`, `"1.0"`, `"1e3"`, `"-0"`, ids beyond 2^53 such as `"12345678901234567890"` | stay strings (converting would change or lose the value) |
| `"{...}"` / `"[...]"` | parsed JSON (recursively revived) |

Numbers are only converted when the conversion is lossless, so ids, zero-padded codes and scientific notation are never altered. Short all-digit text (a PIN `"1234"`, a phone number `"31612345678"`) or a name `"null"` still arrives as a number / `null`, because that cannot be told apart from numeric input. For free-text fields:

- pass `{ revive: false }` to `validate` / `Form.schema` to keep **every** string as submitted (then convert explicitly in your validator), or
- pass your own `options.transform` (it replaces the reviver entirely), or
- read the field with `form.string$` instead of `validate`.

```ts
Form.schema(myValidator, { revive: false });
```

#### Conditional helpers

```ts
form.onlyIf(condition, trueVal, falseVal?)
form.onlyIfPresent(key, (entry) => ..., fallback?)
form.onlyIfArrayPresent(key, (entries) => ..., fallback)
form.selector({ fieldName: (entry, key) => ..., $default?, $error? })
form.selector$({ ... })    // throws fail(400) if no case matches
// selector only matches own keys of your cases object; `$`-prefixed form fields are never treated as cases.
// Errors thrown by a case are routed to `$error` if provided, otherwise rethrown.
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
