import * as publicEnv from '$app/env/public';
import {dev} from '$app/env';
import {type EnhanceInput, not_good} from "../index.js";

const _enabled = ['true', 'TRUE', 'on', 'ON', '1'];
const env = publicEnv as Record<string, unknown>;
const flagValue = (flag: string) => String(env[flag] ?? '').toUpperCase();

export const FeatureFlagChecker = {
    enabled: (value: string) => _enabled.includes(value),
    disabled: (value: string) => !_enabled.includes(value)
}

export const enabled = FeatureFlagChecker.enabled;
export const disabled = FeatureFlagChecker.disabled;

export const FeatureFlag = {
    all: (...flags: string[]) => {
        return (input: EnhanceInput) => {
            // Which of the requested flags are *not* enabled
            const disabledFlags = flags.filter(
                (flag) => !_enabled.includes(flagValue(flag))
            );
            if (!(disabledFlags.length === 0 || dev))
                not_good(input, 503, {
                    message: 'Feature not enabled'
                })

            return {flags};
        };
    },
    oneOf: (...flags: string[]) => {
        return (input: EnhanceInput) => {
            // True if at least one of the given flags is enabled
            const anyEnabled = flags.some((flag) =>
                _enabled.includes(flagValue(flag))
            );
            if (!(anyEnabled || dev))
                not_good(input, 503, {
                    message: 'Feature not enabled'
                })

            return {flags};
        };
    },
    /**
     * @experimental
     * @param flag
     */
    isEnabled: (flag: string) => FeatureFlag.is(flag),
    /**
     * @experimental
     * @param flag
     */
    isDisabled: (flag: string) => FeatureFlag.is(flag, disabled),
    /**
     * @experimental
     * @param flag
     * @param predicate
     */
    is: (flag: string, predicate: (value: string) => boolean = enabled) =>
        dev || predicate(flagValue(flag))
};
