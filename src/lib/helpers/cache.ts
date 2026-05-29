import type { EnhanceFunction, EnhanceInput } from '../index.js';

export type CacheDirective =
    | 'no-store'
    | 'no-cache'
    | 'no-cache, no-store, must-revalidate'
    | `public, max-age=${number}`
    | `private, max-age=${number}`
    | `public, max-age=${number}, stale-while-revalidate=${number}`
    | (string & {});

export type CacheRule = {
    match: RegExp | ((pathname: string) => boolean);
    directive: CacheDirective;
};

const matches = (rule: CacheRule, pathname: string): boolean =>
    rule.match instanceof RegExp ? rule.match.test(pathname) : rule.match(pathname);

export const CacheControl = {
    // ── Directive helpers ──────────────────────────────────────────────────────
    directive: {
        /**
         * `no-store` — Response must never be stored. Bypasses all caches (browser, CDN, proxy).
         * Use for sensitive data (user dashboards, auth responses, banking pages).
         */
        noStore: 'no-store' as CacheDirective,

        /**
         * `no-cache` — Response may be stored but must be revalidated with the origin before reuse.
         * Useful when content changes frequently but you still want conditional GET support (ETags / Last-Modified).
         */
        noCache: 'no-cache' as CacheDirective,

        /**
         * `no-cache, no-store, must-revalidate` — Belt-and-suspenders: disables storage and forces
         * revalidation. Maximally prevents caching across all cache layers including legacy HTTP/1.0 proxies.
         */
        noCacheNoStore: 'no-cache, no-store, must-revalidate' as CacheDirective,

        /**
         * `public, max-age=<seconds>` — Cacheable by any cache (CDN, proxy, browser).
         * Optionally add `stale-while-revalidate` to serve stale content while revalidating in the background.
         *
         * @param maxAge - Seconds the response is considered fresh.
         * @param staleWhileRevalidate - Seconds past max-age where stale content may still be served while a fresh fetch happens in the background.
         */
        public: (maxAge: number, staleWhileRevalidate?: number): CacheDirective =>
            staleWhileRevalidate !== undefined
                ? `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`
                : `public, max-age=${maxAge}`,

        /**
         * `private, max-age=<seconds>` — Cacheable only by the end-user's browser, not by shared caches (CDNs, proxies).
         * Use for personalised content that must not be stored on shared infrastructure.
         *
         * @param maxAge - Seconds the response is considered fresh in the browser cache.
         */
        private: (maxAge: number): CacheDirective => `private, max-age=${maxAge}`,
    },


    // ── Enhancers ──────────────────────────────────────────────────────────────

    /**
     * Handle-level enforcer. Matches pathname against rules and sets Cache-Control
     * via setHeaders(). Only sets the header when a rule matches.
     *
     * Usage:
     *   export const handle = enhance(handler, CacheControl.global(
     *     { match: /^\/api\//, directive: CacheControl.noStore },
     *     { match: /^\/blog\//, directive: CacheControl.public(300) },
     *   ));
     */
    global:
        (...rules: CacheRule[]) =>
        (input: EnhanceInput<'handle'>): void => {
            const rule = rules.find((r) => matches(r, input.url.pathname));
            if (rule) input.setHeaders({ 'cache-control': rule.directive });
        },

    /**
     * Load-level policy. Sets Cache-Control for this specific route via setHeaders().
     *
     * Usage:
     *   export const load = load(fn, CacheControl.local(CacheControl.public(300)));
     */
    local:
        (directive: CacheDirective): EnhanceFunction<'load'> =>
        (input: EnhanceInput<'load'>) => {
            input.setHeaders({ 'cache-control': directive });
            return {};
        },
};
