export const matchesPattern = (pattern: RegExp, value: string): boolean => {
    const lastIndex = pattern.lastIndex;
    try {
        pattern.lastIndex = 0;
        return pattern.test(value);
    } finally {
        pattern.lastIndex = lastIndex;
    }
};
