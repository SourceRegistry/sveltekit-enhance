import {env} from '$env/dynamic/public';
import {dev} from '$app/environment';
import {type EnhanceInput, not_good} from "../index.js";

const enabled = ['true', 'TRUE', 'on', 'ON', '1'];

export const FeatureFlag = {
    all: (...flags: (keyof typeof env)[]) => {
        return (input: EnhanceInput) => {
            // Which of the requested flags are *not* enabled
            const disabledFlags = flags.filter(
                (flag) => !enabled.includes((env[flag] ?? '').toUpperCase())
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
                enabled.includes((env[flag] ?? '').toUpperCase())
            );
            if (!(anyEnabled || dev))
                not_good(input, 503, {
                    message: 'Feature not enabled'
                })

            return {flags};
        };
    }
};
