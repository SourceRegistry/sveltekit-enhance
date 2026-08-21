import {env} from '$env/dynamic/public';
import {dev} from '$app/environment';
import {type EnhanceInput, not_good} from "../index.js";

const _enabled = ['true', 'TRUE', 'on', 'ON', '1'];

export const FeatureFlagChecker = {
    enabled: (value: string) => _enabled.includes(value),
    disabled: (value: string) => !_enabled.includes(value)
}

export const enabled = FeatureFlagChecker.enabled;
export const disabled = FeatureFlagChecker.disabled;

export const FeatureFlag = {
    all: (...flags: (keyof typeof env)[]) => {
        return (input: EnhanceInput) => {
            // Which of the requested flags are *not* enabled
            const disabledFlags = flags.filter(
                (flag) => !_enabled.includes((env[flag] ?? '').toUpperCase())
            );
            if (!(disabledFlags.length === 0 || dev))
                not_good(input, 503, {
                    message: 'Feature not enabled'
                })

            return {flags};
        };
    },
    oneOf: (...flags: (keyof typeof env)[]) => {
        return (input: EnhanceInput) => {
            // True if at least one of the given flags is enabled
            const anyEnabled = flags.some((flag) =>
                _enabled.includes((env[flag] ?? '').toUpperCase())
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
    isEnabled: (flag: keyof typeof env) => FeatureFlag.is(flag),
    /**
     * @experimental
     * @param flag
     */
    isDisabled: (flag: keyof typeof env) => FeatureFlag.is(flag, disabled),
    /**
     * @experimental
     * @param flag
     * @param predicate
     */
    is: (flag: keyof typeof env, predicate: (value: string) => boolean = enabled) =>
        dev || predicate((env[flag] ?? '').toUpperCase())
};
