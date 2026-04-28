# @sourceregistry/sveltekit-enhance

[![npm version](https://img.shields.io/npm/v/@sourceregistry/sveltekit-enhance?logo=npm)](https://www.npmjs.com/package/@sourceregistry/sveltekit-enhance)
[![License](https://img.shields.io/npm/l/@sourceregistry/sveltekit-enhance)](https://github.com/SourceRegistry/sveltekit-enhance/blob/main/LICENSE)
[![CI](https://github.com/SourceRegistry/sveltekit-enhance/actions/workflows/ci.yml/badge.svg)](https://github.com/SourceRegistry/sveltekit-enhance/actions/workflows/ci.yml)

Production-ready utilities for **SvelteKit server flows**.  
Use `@sourceregistry/sveltekit-enhance` to build cleaner actions, loads, methods, and hooks with reusable guards for authentication, feature flags, request correlation, and form processing.

## Why teams use this

- Standardize server-side guard logic across routes.
- Reduce repetitive request parsing and validation code.
- Keep middleware-like behavior explicit and composable.
- Improve observability with correlation IDs on every response.

## Installation

```bash
npm install @sourceregistry/sveltekit-enhance
```

## Core concepts

The package provides an `enhance` wrapper for:

- `enhance.action(...)`
- `enhance.load(...)`
- `enhance.method(...)`
- `enhance.handle(...)`

Each wrapper accepts one or more guard functions and merges their outputs into a typed `guard` object.

## Quick start

```ts
// src/routes/account/+page.server.ts
import {enhance} from '@sourceregistry/sveltekit-enhance';
import {Auth, FeatureFlag, form} from '@sourceregistry/sveltekit-enhance';

export const actions = {
  save: enhance.action(
    async ({request, guard}) => {
      const data = await request.formData();
      const email = form.string$(data, 'email');

      return {
        ok: true,
        token: guard.token,
        email
      };
    },
    Auth.Bearer,
    FeatureFlag.all('PUBLIC_ACCOUNT_EDIT')
  )
};
```

## Included helpers

- `Auth.Bearer`  
  Validates `Authorization: Bearer <token>` and returns `{ token }`.

- `FeatureFlag.all(...flags)` / `FeatureFlag.oneOf(...flags)`  
  Enforces public environment-based feature flags.

- `RequestCorrelation.attach`  
  Reuses incoming `x-correlation-id` / `x-request-id` or generates one, stores it in `locals`, and appends it to response headers.

- `Devtools.ignore`  
  Ignores the Chrome DevTools app-specific probe route with a `204` response.

- `Form` utilities  
  Typed helpers for strings, numbers, booleans, dates, files, arrays, JSON, selector helpers, and schema-style validation workflows.

## Example: handle hook with correlation ID

```ts
// src/hooks.server.ts
import {enhance, RequestCorrelation} from '@sourceregistry/sveltekit-enhance';

export const handle = enhance.handle(
  async ({event, resolve}) => resolve(event),
  RequestCorrelation.attach
);
```

## API exports

```ts
import {
  enhance,
  action,
  load,
  method,
  handle,
  Auth,
  FeatureFlag,
  RequestCorrelation,
  Devtools,
  Form
} from '@sourceregistry/sveltekit-enhance';
```

## Compatibility

- SvelteKit 2+
- Node.js runtime (matching your SvelteKit adapter/runtime support)

## License

Apache-2.0
