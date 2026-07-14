import type { EnhanceInput } from "../index.js";
import {Deferred} from "./internal/Deferred.js";
import {dev} from '$app/environment';

export type StartupConfiguration = {
    showPage: string;
    showJSON: Record<string, any>
    allowedPaths: string[]
    onFailure: (reason: unknown) => void
    readyRedirect: string;
}

export const StartUp = {
    await: (waitOn: (Deferred<any> | Promise<any>)[], config: Partial<StartupConfiguration> = {}) => {
        const {
            showPage = "/startup",
            showJSON = {error: 'service_starting', message: 'Application is initializing'},
            allowedPaths = [],
            onFailure = (reason: unknown) => {
                process.stderr.write(`Unable to startup application because of unresolved startup item reason: ${reason}`)
                process.exit(1)
            },
            readyRedirect = "/"
        } = config;
        const deferredPromises = waitOn.map((r) => {
            if (r instanceof Deferred) return r;
            else return Deferred.Derive(r);
        })
        const isReady = () => {
            for (let waitOnElement of deferredPromises) {
                if (waitOnElement.isRejected) {
                    onFailure(waitOnElement.rejectReason)
                }
                if (!waitOnElement.isResolved)
                    return false;
            }
            return true;
        }
        const isAllowed = (event: EnhanceInput) => {
            return allowedPaths.includes(event.url.pathname) || event.url.pathname === showPage
        }
        return async (input: EnhanceInput<'handle'>) => {
            const ready = isReady();
            if (ready && !dev && input.url.pathname === showPage) {
                throw new Response(null, {status: 302, headers: {Location: readyRedirect}})
            }
            if (!ready && !isAllowed(input)) {
                const acceptsHtml = input.request.headers.get('accept')?.includes('text/html') ?? false;
                if (acceptsHtml) {
                    const response = await input.fetch(showPage)
                    const headers = new Headers(response.headers)
                    headers.set('Retry-After', '4')
                    throw new Response(response.body, {status: 503, headers});
                } else {
                    throw new Response(JSON.stringify(showJSON), {
                        status: 503,
                        headers: {'Content-Type': 'application/json', 'Retry-After': '4'}
                    });
                }
            }
        }
    }

}
