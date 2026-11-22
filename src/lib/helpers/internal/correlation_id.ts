const MAX_CORRELATION_ID_LENGTH = 128;
const SAFE_CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export const normalizeCorrelationId = (raw?: string | null) => {
    if (!raw) return undefined;
    const candidate = raw.trim();
    if (!candidate) return undefined;
    if (candidate.length > MAX_CORRELATION_ID_LENGTH) return undefined;
    if (!SAFE_CORRELATION_ID_PATTERN.test(candidate)) return undefined;
    return candidate;
};
