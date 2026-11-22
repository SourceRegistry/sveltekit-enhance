
const normalizeIp = (value: string | null | undefined) => {
    const ip = value?.trim();
    return ip ? ip : undefined;
};

const forwardedChain = (value: string | null) =>
    (value ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

export const ClientIp = (defaults: {
    TRUST_PROXY_HEADERS: boolean,
    TRUST_PROXY_HOPS: number
} = {TRUST_PROXY_HEADERS: false, TRUST_PROXY_HOPS: 1}) => {
  const api = {
    forwardedChain,
    fromForwardedFor(value: string | null, trustedProxyHops = defaults.TRUST_PROXY_HOPS) {
        const chain = forwardedChain(value);
        if (chain.length < trustedProxyHops) return undefined;
        return normalizeIp(chain[chain.length - trustedProxyHops]);
    },
    fromRequest(
        request: Request,
        options: {
            trustProxyHeaders?: boolean;
            trustedProxyHops?: number;
        } = {}
    ) {
        const trustProxyHeaders = options.trustProxyHeaders ?? defaults.TRUST_PROXY_HEADERS;
        const trustedProxyHops = Math.max(1, options.trustedProxyHops ?? defaults.TRUST_PROXY_HOPS);
        if (!trustProxyHeaders) return undefined;

        // When X-Forwarded-For is present it is authoritative: a too-short chain means the trusted
        // proxies did not add enough hops, so do not fall back to a client-spoofable x-real-ip.
        const forwardedFor = request.headers.get('x-forwarded-for');
        if (forwardedFor !== null) return api.fromForwardedFor(forwardedFor, trustedProxyHops);
        return normalizeIp(request.headers.get('x-real-ip'));
    }
  };
  return api;
};

