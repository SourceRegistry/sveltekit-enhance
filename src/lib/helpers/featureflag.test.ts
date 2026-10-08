import {describe, expect, it, vi} from 'vitest';

vi.mock('$app/env', () => ({dev: false}));
vi.mock('$app/env/public', () => ({BOOLEAN_FLAG: true, NUMBER_FLAG: 1, DISABLED_FLAG: false}));

import {FeatureFlag} from './featureflag.js';

describe('FeatureFlag', () => {
    it('accepts typed public environment values', () => {
        expect(FeatureFlag.isEnabled('BOOLEAN_FLAG')).toBe(true);
        expect(FeatureFlag.isEnabled('NUMBER_FLAG')).toBe(true);
        expect(FeatureFlag.isEnabled('DISABLED_FLAG')).toBe(false);
    });
});
