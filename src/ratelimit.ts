import type {
  Algorithm,
  Context,
  LimitOptions,
  RatelimitResponse,
} from "./types";

export type RatelimitConfig<R> = {
  /**
   * The ratelimiter function to use.
   *
   * Choose one of the predefined ones or implement your own.
   * Available algorithms are exposed via static methods:
   * - Ratelimiter.fixedWindow
   * - Ratelimiter.slidingWindow
   * - Ratelimiter.tokenBucket
   */

  limiter: Algorithm<R>;

  ctx: Context<R>;
  /**
   * All keys in redis are prefixed with this.
   *
   * @default `@hummn/ratelimit`
   */
  prefix?: string;

  /**
   * If set, the ratelimiter will allow requests to pass after this many milliseconds.
   *
   * Use this if you want to allow requests in case of network problems
   *
   * @default 5000
   */
  timeout?: number;
};

export abstract class BaseRatelimit<R> {
  protected readonly limiter: Algorithm<R>;

  protected readonly ctx: Context<R>;

  protected readonly prefix: string;

  protected readonly timeout: number;

  protected readonly primaryRedis: R;

  constructor(config: RatelimitConfig<R>) {
    this.ctx = config.ctx;
    this.limiter = config.limiter;
    // biome-ignore lint: reason (biome suppressions/parse)
    this.timeout = config.timeout ?? 5000;
    this.prefix = config.prefix ?? "@hummn/ratelimit";

    this.primaryRedis = config.ctx.redis;
  }

  protected key = (identifier: string): string =>
    [this.prefix, identifier].join(":");

  limit = async (
    identifier: string,
    req?: LimitOptions
  ): Promise<RatelimitResponse> => {
    const controller = new AbortController();
    try {
      const responseArray = [this.getRatelimitResponse(identifier, req)];
      const timeoutResponse = this.createTimedOutResponse(controller);

      if (this.timeout > 0) {
        responseArray.push(timeoutResponse);
      }

      // ✅ SAFE (AbortController) - losing promise is GC'd
      return await Promise.race(responseArray);
    } finally {
      controller.abort();
    }
  };

  resetUsedTokens = async (identifier: string) => {
    const pattern = [this.prefix, identifier].join(":");
    await this.limiter.resetTokens(this.ctx, pattern);
  };

  /**
   * Returns the remaining token count together with a reset timestamps
   *
   * @param identifier identifir to check
   * @returns object with `remaining` and reset fields. `remaining` denotes
   *          the remaining tokens and reset denotes the timestamp when the
   *          tokens reset.
   */
  getRemaining = async (
    identifier: string
  ): Promise<{
    remaining: number;
    reset: number;
  }> => {
    const pattern = [this.prefix, identifier].join(":");

    return await this.limiter.getRemaining(this.ctx, pattern);
  };

  /**

   * Calls redis to check the rate limit and deny list.
   *
   * @param identifier identifier to block
   * @param req options with ip, user agent, country, rate and geo info
   * @returns rate limit response
   */
  protected getRatelimitResponse = async (
    identifier: string,
    req?: LimitOptions
  ): Promise<RatelimitResponse> => {
    const key = this.key(identifier);

    return await this.limiter.limit(this.ctx, key, req?.rate);
  };

  private createTimedOutResponse(controller: AbortController) {
    return new Promise<RatelimitResponse>((resolve) => {
      const result: RatelimitResponse = {
        success: true,
        limit: 0,
        remaining: 0,
        reset: 0,
        pending: Promise.resolve(),
        reason: "timeout",
      };

      // Check if already aborted
      if (controller.signal.aborted) {
        return resolve(result);
      }

      const timeoutId = setTimeout(() => {
        resolve(result);
      }, this.timeout);

      // Listen for abort to cancel timeout
      controller.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeoutId);
        },
        { once: true }
      );
    });
  }

  /**
   * Block until the request may pass or timeout is reached.
   *
   * This method returns a promise that resolves as soon as the request may be processed
   * or after the timeout has been reached.
   *
   * Use this if you want to delay the request until it is ready to get processed.
   *
   * @example
   * ```ts
   *  const ratelimit = new HummnRatelimit({
   *    redis: Redis.fromEnv(),
   *    limiter: Ratelimit.slidingWindow(10, "10 s")
   *  })
   *
   *  const { success } = await ratelimit.blockUntilReady(id, 60_000)
   *  if (!success){
   *    return "Nope"
   *  }
   *  return "Yes"
   * ```
   */
  blockUntilReady = async (
    /**
     * An identifier per user or api.
     * Choose a userID, or api token, or ip address.
     *
     * If you want to limit your api across all users, you can set a constant string.
     */
    identifier: string,
    /**
     * Maximum duration to wait in milliseconds.
     * After this time the request will be denied.
     */
    timeout: number
  ): Promise<RatelimitResponse> => {
    if (timeout <= 0) {
      throw new Error("timeout must be positive");
    }

    const deadline = Date.now() + timeout;
    let res: RatelimitResponse;

    while (true) {
      res = await this.limit(identifier);
      if (res.success) {
        break;
      }
      if (res.reset === 0) {
        throw new Error("[Invalid Reset]: This should not happen");
      }

      const wait = Math.min(res.reset, deadline) - Date.now();
      await new Promise((r) => setTimeout(r, wait));

      if (Date.now() > deadline) {
        break;
      }
    }
    // biome-ignore lint: reason (biome suppressions/parse)
    return res!;
  };
}
