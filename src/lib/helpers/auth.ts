import {type EnhanceInput, not_good} from "../index.js";


export const Auth = {
    Bearer: (input: EnhanceInput) => {
        if (!input.request.headers.has('Authorization'))
            not_good(input, 401, {message: "Invalid 'Authorization' header"})
        const authorization = input.request.headers.get('Authorization') as string;
        if (!(authorization && authorization.split('Bearer')))
            not_good(input, 401, {message: 'Invalid Bearer token provided'});
        const token = authorization.split(' ')?.[1];
        if (!token)
            not_good(input, 401, {message: 'Invalid Bearer token provided'});
        return {
            token
        };
    }
};
