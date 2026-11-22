import {type EnhanceInput, not_good} from "../index.js";


export const Auth = {
    Bearer: (input: EnhanceInput) => {
        if (!input.request.headers.has('Authorization'))
            not_good(input, 401, {message: "Invalid 'Authorization' header"})
        const authorization = input.request.headers.get('Authorization') as string;
        // RFC 6750: case-insensitive "Bearer" scheme followed by a single token
        const token = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '')?.[1];
        if (!token)
            not_good(input, 401, {message: 'Invalid Bearer token provided'});
        return {
            token
        };
    }
};
