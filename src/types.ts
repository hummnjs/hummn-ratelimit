export type Context<R> = {
  redis: R;
  status: "connected" | "disconnected";
};

/**
 * EphemeralCache is used to block certain identifiers right away in case they have already exceeded the ratelimit.
 */
export type EphemeralCache = {
  isBlocked: (identifier: string) => { blocked: boolean; reset: number };
  blockUntil: (identifier: string, reset: number) => void;

  set: (key: string, value: number) => void;
  get: (key: string) => number | null;

  incr: (key: string) => number;

  pop: (key: string) => void;
  empty: () => void;

  size: () => number;
};

export type RatelimitResponseType = "timeout" | "cacheBlock" | "denyList";

export type RatelimitResponse = {
  /**
   * Whether the request may pass(true) or exceeded the limit(false)
   */
  success: boolean;
  /**
   * Maximum number of requests allowed within a window.
   */
  limit: number;
  /**
   * How many requests the user has left within the current window.
   */
  remaining: number;
  /**
   * Unix timestamp in milliseconds when the limits are reset.
   */
  reset: number;

  /**
   * For the MultiRegion setup we do some synchronizing in the background, after returning the current limit.
   * Or when analytics is enabled, we send the analytics asynchronously after returning the limit.
   * In most case you can simply ignore this.
   *
   * On Vercel Edge or Cloudflare workers, you need to explicitly handle the pending Promise like this:
   *
   * ```ts
   * const { pending } = await ratelimit.limit("id")
   * context.waitUntil(pending)
   * ```
   *
   * See `waitUntil` documentation in
   * [Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/#contextwaituntil)
   * and [Vercel](https://vercel.com/docs/functions/edge-middleware/middleware-api#waituntil)
   * for more details.
   * ```
   */
  pending: Promise<unknown>;

  /**
   * Reason behind the result in `success` field.
   * - Is set to "timeout" when request times out
   * - Is set to "cacheBlock" when an identifier is blocked through cache without calling redis because it was
   *    rate limited previously.
   * - Is set to undefined if rate limit check had to use Redis. This happens in cases when `success` field in
   *    the response is true. It can also happen the first time sucecss is false.
   */
  reason?: RatelimitResponseType;
};

export type Algorithm<R> = {
  limit: (
    ctx: Context<R>,
    identifier: string,
    rate?: number,
    opts?: {
      cache?: EphemeralCache;
    }
  ) => Promise<RatelimitResponse>;
  getRemaining: (
    redis: Context<R>,
    identifier: string
  ) => Promise<{
    remaining: number;
    reset: number;
  }>;
  resetTokens: (redis: Context<R>, identifier: string) => Promise<void>;
};

export type LimitOptions = {
  geo?: Geo;
  rate?: number;
  ip?: string;
  userAgent?: string;
  country?: string;
};

export type Geo = {
  country?: string;
  city?: string;
  region?: string;
  ip?: string;
};
