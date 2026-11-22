export type ReconnectBackoffOptions = {
    /** first delay in ms (default 1000) */
    initialDelayMs?: number
    /** upper bound in ms (default 60000) */
    maxDelayMs?: number
    /** growth per attempt (default 2) */
    factor?: number
    /** random spread as a fraction of the delay, 0..1 (default 0.2) */
    jitter?: number
    /** random source returning [0, 1) (default Math.random) */
    random?: () => number
}

export type ReconnectBackoff = {
    /** number of delays handed out since the last reset() */
    readonly attempt: number
    /** delay in ms before the next reconnection attempt */
    next(): number
    /** call after a successful connection */
    reset(): void
}

/** Exponential reconnect backoff (opt-in helper; Baileys itself never reconnects automatically). */
export declare const makeReconnectBackoff: (options?: ReconnectBackoffOptions) => ReconnectBackoff
