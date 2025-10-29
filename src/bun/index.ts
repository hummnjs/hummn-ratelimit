import { RedisClient, type RedisOptions } from "bun";
import ms, { type StringValue as Duration } from "ms";
import { tokenBucketIdentifierNotFound } from "../lua-scripts/algorithms";
import { RESET_SCRIPT, SCRIPTS, type ScriptInfo } from "../lua-scripts/hash";
import { BaseRatelimit } from "../ratelimit";
import type { Algorithm } from "../types";

export type RatelimitConfig = {
  timeout?: number;
  /**
   * All keys in redis are prefixed with this.
   *
   * @default `@hummn/ratelimit`
   */
  prefix?: string;

  limiter: Algorithm<RedisClient>;

  /**
   * Redis client or options to create a new client.
   * @param url URL to connect to, defaults to process.env.VALKEY_URL, process.env.REDIS_URL, or "valkey://localhost:6379"
   */
  redis: RedisClient | (RedisOptions & { url?: string });
};

/**
 * Ratelimiter using bun redis from https://bun.com/docs/api/redis
 *
 * @example
 * ```ts
 * import { redis } from "bun";
 * const { limit } = new Ratelimit({
 *    redis: redis,
 *    limiter: Ratelimit.fixedWindow(
 *      "30 m", // interval of 30 minutes
 *      10,     // Allow 10 requests per window of 30 minutes
 *    )
 * })
 *
 * ```
 */
export class Ratelimit extends BaseRatelimit<RedisClient> {
  /**
   * Create a new Ratelimit instance by providing a `Bun.RedisClient` instance or a `Bun.RedisOptions` and the algorithm of your choice.
   */

  constructor(config: RatelimitConfig) {
    let client: RedisClient;
    if (config.redis instanceof RedisClient) {
      client = config.redis;
    } else {
      client = new RedisClient(config.redis.url, config.redis);
    }

    super({
      prefix: config.prefix,
      limiter: config.limiter,
      timeout: config.timeout,
      ctx: {
        redis: client,
        /**
         * Allow bun manage the connection lifecycle
         */
        status: "connected",
      },
    });
  }

  /**
   * Each request inside a fixed time increases a counter.
   * Once the counter reaches the maximum allowed number, all further requests are
   * rejected.
   *
   * **Pro:**
   *
   * - Newer requests are not starved by old ones.
   * - Low storage cost.
   *
   * **Con:**
   *
   * A burst of requests near the boundary of a window can result in a very
   * high request rate because two windows will be filled with requests quickly.
   *
   * @param tokens - How many requests a user can make in each time window.
   * @param window - A fixed timeframe
   */
  static fixedWindow(tokens: number, window: Duration): Algorithm<RedisClient> {
    const windowDuration = ms(window);
    return {
      async limit(ctx, identifier, rate) {
        const bucket = Math.floor(Date.now() / windowDuration);
        const key = [identifier, bucket].join(":");

        const incrementBy = rate ? Math.max(1, rate) : 1;

        const usedTokensAfterUpdate = (await Ratelimit.safeEval(
          ctx.redis,
          SCRIPTS.default.fixedWindow.limit,
          "1",
          key,
          String(windowDuration),
          String(incrementBy)
        )) as number;

        const success = usedTokensAfterUpdate <= tokens;

        const remainingTokens = Math.max(0, tokens - usedTokensAfterUpdate);

        const reset = (bucket + 1) * windowDuration;

        return {
          success,
          limit: tokens,
          remaining: remainingTokens,
          reset,
          pending: Promise.resolve(),
        };
      },
      async getRemaining(ctx, identifier) {
        const bucket = Math.floor(Date.now() / windowDuration);
        const key = [identifier, bucket].join(":");

        const usedTokens = (await Ratelimit.safeEval(
          ctx.redis,
          SCRIPTS.default.fixedWindow.getRemaining,
          "1",
          key
        )) as number | string | undefined;

        return {
          remaining: Math.max(0, tokens - Number(usedTokens || 0)),
          reset: (bucket + 1) * windowDuration,
        };
      },
      async resetTokens(ctx, identifier) {
        const pattern = [identifier, "*"].join(":");

        await Ratelimit.safeEval(ctx.redis, RESET_SCRIPT, "1", pattern);
      },
    };
  }

  /**
   * Combined approach of `slidingLogs` and `fixedWindow` with lower storage
   * costs than `slidingLogs` and improved boundary behavior by calculating a
   * weighted score between two windows.
   *
   * **Pro:**
   *
   * Good performance allows this to scale to very high loads.
   *
   * **Con:**
   *
   * Nothing major.
   *
   * @param tokens - How many requests a user can make in each time window.
   * @param window - The duration in which the user can max X requests.
   */
  static slidingWindow(
    tokens: number,
    window: Duration
  ): Algorithm<RedisClient> {
    const windowSize = ms(window);
    return {
      async limit(ctx, identifier, rate) {
        const now = Date.now();
        const currentWindow = Math.floor(now / windowSize);
        const currentKey = [identifier, currentWindow].join(":");

        const previousWindow = currentWindow - 1;
        const previousKey = [identifier, previousWindow].join(":");

        const incrementBy = rate ? Math.max(1, rate) : 1;

        const remaining = (await Ratelimit.safeEval(
          ctx.redis,
          SCRIPTS.default.slidingWindow.limit,
          "2",
          currentKey,
          previousKey,
          String(tokens),
          String(now),
          String(windowSize),
          String(incrementBy)
        )) as number;

        const success = remaining >= 0;

        const reset = (currentWindow + 1) * windowSize;

        return {
          success,
          limit: tokens,
          remaining,
          reset,
          pending: Promise.resolve(),
        };
      },
      async getRemaining(ctx, identifier) {
        const now = Date.now();
        const currentWindow = Math.floor(now / windowSize);
        const currentKey = [identifier, currentWindow].join(":");
        const previousWindow = currentWindow - 1;
        const previousKey = [identifier, previousWindow].join(":");

        const usedTokens = (await Ratelimit.safeEval(
          ctx.redis,
          SCRIPTS.default.slidingWindow.getRemaining,
          "2",
          currentKey,
          previousKey,
          String(now),
          String(windowSize)
        )) as number | string | undefined;

        return {
          remaining: Math.max(0, tokens - Number(usedTokens || "0")),
          reset: (currentWindow + 1) * windowSize,
        };
      },
      async resetTokens(ctx, identifier) {
        const pattern = [identifier, "*"].join(":");

        await Ratelimit.safeEval(ctx.redis, RESET_SCRIPT, "1", pattern);
      },
    };
  }

  /**
   * You have a bucket filled with `{maxTokens}` tokens that refills constantly
   * at `{refillRate}` per `{interval}`.
   * Every request will remove one token from the bucket and if there is no
   * token to take, the request is rejected.
   *
   * **Pro:**
   *
   * - Bursts of requests are smoothed out and you can process them at a constant
   * rate.
   * - Allows to set a higher initial burst limit by setting `maxTokens` higher
   * than `refillRate`
   */
  static tokenBucket(
    refillRate: number,
    interval: Duration,
    maxTokens: number
  ): Algorithm<RedisClient> {
    const intervalDuration = ms(interval);
    return {
      async limit(ctx, identifier, rate) {
        const now = Date.now();

        const incrementBy = rate ? Math.max(1, rate) : 1;

        const [remaining, reset] = (await Ratelimit.safeEval(
          ctx.redis,
          SCRIPTS.default.tokenBucket.limit,
          "1",
          identifier,
          String(maxTokens),
          String(intervalDuration),
          String(refillRate),
          String(now),
          String(incrementBy)
        )) as [number, number];

        const success = remaining >= 0;

        return {
          success,
          limit: maxTokens,
          remaining,
          reset,
          pending: Promise.resolve(),
        };
      },
      async getRemaining(ctx, identifier) {
        const [remainingTokens, refilledAt] = (await Ratelimit.safeEval(
          ctx.redis,
          SCRIPTS.default.tokenBucket.getRemaining,
          "1",
          identifier,
          String(maxTokens)
        )) as [number | string | undefined, number | string | undefined];

        const freshRefillAt = Date.now() + intervalDuration;
        const identifierRefillsAt =
          Number(refilledAt || 0) + Number(intervalDuration || 0);

        return {
          remaining: Number(remainingTokens || 0),
          reset:
            refilledAt === tokenBucketIdentifierNotFound
              ? freshRefillAt
              : identifierRefillsAt,
        };
      },
      async resetTokens(ctx, identifier) {
        const pattern = [identifier, "*"].join(":");

        await Ratelimit.safeEval(ctx.redis, RESET_SCRIPT, "1", pattern);
      },
    };
  }

  /**
   * Runs the specified script with EVALSHA using the scriptHash parameter.
   *
   * If the EVALSHA fails, loads the script to redis and runs again with the
   * hash returned from Redis.
   *
   * @param ctx Regional or multi region context
   * @param script ScriptInfo of script to run. Contains the script and its hash
   * @param args eval keys
   */
  protected static async safeEval(
    redis: RedisClient,
    script: ScriptInfo,
    ...args: string[]
  ) {
    try {
      return await redis.send("EVALSHA", [script.hash, ...args]);
    } catch (error) {
      if (`${error}`.toLowerCase().includes("noscript")) {
        return await redis.send("SCRIPT", ["LOAD", script.script]);
      }
      throw error;
    }
  }
}
