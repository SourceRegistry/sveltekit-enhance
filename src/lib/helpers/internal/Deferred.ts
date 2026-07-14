/**
 * A deferred promise implementation that allows external resolution/rejection
 */
export class Deferred<T = void> {
    public readonly promise: Promise<T>;
    public resolve!: (value: T | PromiseLike<T>) => void;
    public reject!: (reason?: any) => void;

    private _isResolved = false;
    private _isRejected = false;
    private _rejectReason?: any = undefined

    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolve = (value: T | PromiseLike<T>) => {
                if (!this._isResolved && !this._isRejected) {
                    this._isResolved = true;
                    resolve(value);
                }
            };

            this.reject = (reason?: any) => {
                if (!this._isResolved && !this._isRejected) {
                    this._isRejected = true;
                    reject(reason);
                }
            };
        });
    }

    /**
     * Returns true if the promise has been resolved
     */
    get isResolved(): boolean {
        return this._isResolved;
    }

    /**
     * Returns true if the promise has been rejected
     */
    get isRejected(): boolean {
        return this._isRejected;
    }

    get rejectReason(): unknown {
        return this._rejectReason
    }

    /**
     * Returns true if the promise is still pending
     */
    get isPending(): boolean {
        return !this._isResolved && !this._isRejected;
    }

    /**
     * Returns true if the promise has been settled (resolved or rejected)
     */
    get isSettled(): boolean {
        return this._isResolved || this._isRejected;
    }

    step<TResult2 = never>(): [onfulfilled?: ((value: T) => T | PromiseLike<T>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null] {
        return [
            (r) => {
                this.resolve(r);
                return r;
            },
            (reason) => {
                this._rejectReason = reason;
                this.reject(reason);
                return reason;
            }
        ]
    }

    static Derive<T>(promise: Promise<T>): Deferred<T> {
        const deferred = new Deferred<T>();
        promise.then(
            (res) => deferred.resolve(res),
            (res) => deferred.reject(res)
        )
        return deferred;
    }

}
