
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
} = {TRUST_PROXY_HEADERS: false, TRUST_PROXY_HOPS: 1}) => ({
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

        return (
            ClientIp(defaults).fromForwardedFor(request.headers.get('x-forwarded-for'), trustedProxyHops) ??
            normalizeIp(request.headers.get('x-real-ip'))
        );
    }
});

