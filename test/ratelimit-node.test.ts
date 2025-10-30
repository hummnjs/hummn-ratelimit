import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createClient } from "@redis/client";
import type { RedisClientType } from "@redis/client";
import { HummnRatelimit } from "../src/node";

describe("HummnRatelimit (Node.js)", () => {
  let redis: RedisClientType;
  const testPrefix = "test:ratelimit:node";

  beforeEach(async () => {
    redis = createClient({ url: "redis://localhost:6379" });
    await redis.connect();
  });

  afterEach(async () => {
    // Clean up test keys
    const keys = await redis.keys(`${testPrefix}*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }
    await redis.quit();
  });

  describe("Fixed Window Algorithm", () => {
    test("should allow requests within limit", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(5, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:fixed:1";

      // Make 5 requests - all should succeed
      for (let i = 0; i < 5; i++) {
        const result = await ratelimit.limit(identifier);
        expect(result.success).toBe(true);
        expect(result.limit).toBe(5);
        expect(result.remaining).toBe(5 - i - 1);
      }
    });

    test("should reject requests exceeding limit", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(3, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:fixed:2";

      // Make 3 requests - all should succeed
      for (let i = 0; i < 3; i++) {
        const result = await ratelimit.limit(identifier);
        expect(result.success).toBe(true);
      }

      // 4th request should fail
      const result = await ratelimit.limit(identifier);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test("should reset counter in new window", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(2, "1s"),
        prefix: testPrefix,
      });

      const identifier = "user:fixed:3";

      // Use up the limit
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);

      const failResult = await ratelimit.limit(identifier);
      expect(failResult.success).toBe(false);

      // Wait for window to reset
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should succeed in new window
      const newWindowResult = await ratelimit.limit(identifier);
      expect(newWindowResult.success).toBe(true);
      expect(newWindowResult.remaining).toBe(1);
    });

    test("should return correct reset timestamp", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(5, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:fixed:4";
      const result = await ratelimit.limit(identifier);

      expect(result.reset).toBeGreaterThan(Date.now());
      expect(result.reset).toBeLessThanOrEqual(Date.now() + 10000);
    });

    test("should get remaining tokens correctly", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(10, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:fixed:5";

      // Make 3 requests
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);

      const remaining = await ratelimit.getRemaining(identifier);
      expect(remaining.remaining).toBe(7);
      expect(remaining.reset).toBeGreaterThan(Date.now());
    });

    test("should reset used tokens", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(3, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:fixed:6";

      // Use all tokens
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);

      const beforeReset = await ratelimit.limit(identifier);
      expect(beforeReset.success).toBe(false);

      // Reset tokens
      await ratelimit.resetUsedTokens(identifier);

      // Should succeed after reset
      const afterReset = await ratelimit.limit(identifier);
      expect(afterReset.success).toBe(true);
      expect(afterReset.remaining).toBe(2);
    });
  });

  describe("Sliding Window Algorithm", () => {
    test("should allow requests within limit", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.slidingWindow(5, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:sliding:1";

      // Make 5 requests - all should succeed
      for (let i = 0; i < 5; i++) {
        const result = await ratelimit.limit(identifier);
        expect(result.success).toBe(true);
        expect(result.limit).toBe(5);
      }
    });

    test("should reject requests exceeding limit", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.slidingWindow(3, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:sliding:2";

      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        await ratelimit.limit(identifier);
      }

      // 4th request should fail
      const result = await ratelimit.limit(identifier);
      expect(result.success).toBe(false);
    });

    test("should handle sliding window correctly", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.slidingWindow(3, "2s"),
        prefix: testPrefix,
      });

      const identifier = "user:sliding:3";

      // Make 2 requests
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);

      // Wait half window
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Should still be able to make 1 more request
      const result = await ratelimit.limit(identifier);
      expect(result.success).toBe(true);
    });

    test("should get remaining tokens correctly", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.slidingWindow(10, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:sliding:4";

      // Make 4 requests
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);

      const remaining = await ratelimit.getRemaining(identifier);
      expect(remaining.remaining).toBeLessThanOrEqual(6);
      expect(remaining.reset).toBeGreaterThan(Date.now());
    });

    test("should reset used tokens", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.slidingWindow(2, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:sliding:5";

      // Use all tokens
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);

      const beforeReset = await ratelimit.limit(identifier);
      expect(beforeReset.success).toBe(false);

      // Reset tokens
      await ratelimit.resetUsedTokens(identifier);

      // Should succeed after reset
      const afterReset = await ratelimit.limit(identifier);
      expect(afterReset.success).toBe(true);
    });
  });

  describe("Token Bucket Algorithm", () => {
    test("should allow burst requests up to maxTokens", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.tokenBucket(1, "1s", 5),
        prefix: testPrefix,
      });

      const identifier = "user:bucket:1";

      // Should allow 5 immediate requests (burst)
      for (let i = 0; i < 5; i++) {
        const result = await ratelimit.limit(identifier);
        expect(result.success).toBe(true);
        expect(result.limit).toBe(5);
      }
    });

    test("should reject when bucket is empty", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.tokenBucket(1, "1s", 3),
        prefix: testPrefix,
      });

      const identifier = "user:bucket:2";

      // Use all tokens
      for (let i = 0; i < 3; i++) {
        await ratelimit.limit(identifier);
      }

      // Next request should fail
      const result = await ratelimit.limit(identifier);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test("should refill tokens over time", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.tokenBucket(2, "1s", 5),
        prefix: testPrefix,
      });

      const identifier = "user:bucket:3";

      // Use all tokens
      for (let i = 0; i < 5; i++) {
        await ratelimit.limit(identifier);
      }

      const beforeRefill = await ratelimit.limit(identifier);
      expect(beforeRefill.success).toBe(false);

      // Wait for refill (2 tokens per second)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should have refilled tokens
      const afterRefill = await ratelimit.limit(identifier);
      expect(afterRefill.success).toBe(true);
    });

    test("should not exceed maxTokens when refilling", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.tokenBucket(10, "1s", 5),
        prefix: testPrefix,
      });

      const identifier = "user:bucket:4";

      // Use 2 tokens
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);

      // Wait for multiple refill intervals
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Should still be capped at maxTokens (5)
      const remaining = await ratelimit.getRemaining(identifier);
      expect(remaining.remaining).toBeLessThanOrEqual(5);
    });

    test("should get remaining tokens correctly", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.tokenBucket(1, "1s", 10),
        prefix: testPrefix,
      });

      const identifier = "user:bucket:5";

      // Use 3 tokens
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);

      const remaining = await ratelimit.getRemaining(identifier);
      expect(remaining.remaining).toBe(7);
      expect(remaining.reset).toBeGreaterThan(Date.now());
    });

    test("should reset used tokens", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.tokenBucket(1, "1s", 2),
        prefix: testPrefix,
      });

      const identifier = "user:bucket:6";

      // Use all tokens
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);

      const beforeReset = await ratelimit.limit(identifier);
      expect(beforeReset.success).toBe(false);

      // Reset tokens
      await ratelimit.resetUsedTokens(identifier);

      // Should succeed after reset
      const afterReset = await ratelimit.limit(identifier);
      expect(afterReset.success).toBe(true);
    });
  });

  describe("Custom Rate Parameter", () => {
    test("should consume custom rate tokens (fixedWindow)", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(10, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:custom:1";

      // Use 5 tokens at once
      const result = await ratelimit.limit(identifier, { rate: 5 });
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(5);

      // Next request with rate 3
      const result2 = await ratelimit.limit(identifier, { rate: 3 });
      expect(result2.success).toBe(true);
      expect(result2.remaining).toBe(2);
    });

    test("should consume custom rate tokens (slidingWindow)", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.slidingWindow(10, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:custom:2";

      // Use 7 tokens at once
      const result = await ratelimit.limit(identifier, { rate: 7 });
      expect(result.success).toBe(true);

      // Try to use 5 more - should fail
      const result2 = await ratelimit.limit(identifier, { rate: 5 });
      expect(result2.success).toBe(false);
    });

    test("should consume custom rate tokens (tokenBucket)", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.tokenBucket(1, "1s", 10),
        prefix: testPrefix,
      });

      const identifier = "user:custom:3";

      // Use 6 tokens at once
      const result = await ratelimit.limit(identifier, { rate: 6 });
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });

  describe("Timeout Handling", () => {
    test("should timeout and allow request on timeout", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(5, "10s"),
        prefix: testPrefix,
        timeout: 100, // Very short timeout
      });

      const identifier = "user:timeout:1";
      const result = await ratelimit.limit(identifier);

      // Should succeed (either from Redis or timeout)
      expect(result.success).toBe(true);
    });

    test("should not timeout when timeout is 0", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(5, "10s"),
        prefix: testPrefix,
        timeout: 0,
      });

      const identifier = "user:timeout:2";
      const result = await ratelimit.limit(identifier);

      // Should succeed from Redis
      expect(result.success).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("blockUntilReady", () => {
    test("should block until ready", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(2, "2s"),
        prefix: testPrefix,
      });

      const identifier = "user:block:1";

      // Use all tokens
      await ratelimit.limit(identifier);
      await ratelimit.limit(identifier);

      const startTime = Date.now();

      // Block until ready (should wait for window reset)
      const result = await ratelimit.blockUntilReady(identifier, 3000);

      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(elapsed).toBeGreaterThan(1000); // Should have waited
    });

    test("should timeout if deadline exceeded", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(1, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:block:2";

      // Use token
      await ratelimit.limit(identifier);

      // Try to block with short timeout
      const result = await ratelimit.blockUntilReady(identifier, 500);
      expect(result.success).toBe(false);
    });

    test("should throw error for negative timeout", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(5, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:block:3";

      await expect(ratelimit.blockUntilReady(identifier, -100)).rejects.toThrow(
        "timeout must be positive"
      );
    });
  });

  describe("Multiple Identifiers", () => {
    test("should track different identifiers independently", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(2, "10s"),
        prefix: testPrefix,
      });

      // User 1 uses their limit
      await ratelimit.limit("user:1");
      await ratelimit.limit("user:1");
      const user1Result = await ratelimit.limit("user:1");
      expect(user1Result.success).toBe(false);

      // User 2 should still have their full limit
      const user2Result = await ratelimit.limit("user:2");
      expect(user2Result.success).toBe(true);
      expect(user2Result.remaining).toBe(1);
    });
  });

  describe("Prefix Configuration", () => {
    test("should use custom prefix", async () => {
      const customPrefix = "custom:prefix:node";
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(5, "10s"),
        prefix: customPrefix,
      });

      const identifier = "user:prefix:1";
      await ratelimit.limit(identifier);

      // Check that key exists with custom prefix
      const keys = await redis.keys(`${customPrefix}*`);
      expect(keys.length).toBeGreaterThan(0);

      // Cleanup
      if (keys.length > 0) {
        await redis.del(keys);
      }
    });

    test("should use default prefix when not specified", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(5, "10s"),
      });

      const identifier = "user:prefix:2";
      await ratelimit.limit(identifier);

      // Check that key exists with default prefix
      const keys = await redis.keys("@hummn/ratelimit*");
      expect(keys.length).toBeGreaterThan(0);

      // Cleanup
      if (keys.length > 0) {
        await redis.del(keys);
      }
    });
  });

  describe("Response Structure", () => {
    test("should return complete response structure", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(5, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:response:1";
      const result = await ratelimit.limit(identifier);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("limit");
      expect(result).toHaveProperty("remaining");
      expect(result).toHaveProperty("reset");
      expect(result).toHaveProperty("pending");

      expect(typeof result.success).toBe("boolean");
      expect(typeof result.limit).toBe("number");
      expect(typeof result.remaining).toBe("number");
      expect(typeof result.reset).toBe("number");
      expect(result.pending).toBeInstanceOf(Promise);
    });
  });

  describe("Edge Cases", () => {
    test("should handle rapid sequential requests", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(100, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:rapid:1";
      const promises = [];

      // Fire 50 requests rapidly
      for (let i = 0; i < 50; i++) {
        promises.push(ratelimit.limit(identifier));
      }

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    test("should handle concurrent requests from different identifiers", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(5, "10s"),
        prefix: testPrefix,
      });

      const promises = [];

      // 10 different users making requests
      for (let i = 0; i < 10; i++) {
        promises.push(ratelimit.limit(`user:concurrent:${i}`));
      }

      const results = await Promise.all(promises);

      // All should succeed as they are different identifiers
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    test("should handle zero remaining correctly", async () => {
      const ratelimit = new HummnRatelimit({
        redis,
        limiter: HummnRatelimit.fixedWindow(1, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:zero:1";

      // First request
      const first = await ratelimit.limit(identifier);
      expect(first.success).toBe(true);
      expect(first.remaining).toBe(0);

      // Second request
      const second = await ratelimit.limit(identifier);
      expect(second.success).toBe(false);
      expect(second.remaining).toBe(0);
    });
  });

  describe("Connection Management", () => {
    test("should auto-connect to Redis", async () => {
      const redisClient = createClient({ url: "redis://localhost:6379" });

      const ratelimit = new HummnRatelimit({
        redis: redisClient,
        limiter: HummnRatelimit.fixedWindow(5, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:connection:1";

      // Should work even though we didn't manually connect
      const result = await ratelimit.limit(identifier);
      expect(result.success).toBe(true);

      // Cleanup
      const keys = await redisClient.keys(`${testPrefix}*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      await redisClient.quit();
    });

    test("should work with already connected client", async () => {
      const redisClient = createClient({ url: "redis://localhost:6379" });
      await redisClient.connect();

      const ratelimit = new HummnRatelimit({
        redis: redisClient,
        limiter: HummnRatelimit.fixedWindow(5, "10s"),
        prefix: testPrefix,
      });

      const identifier = "user:connection:2";
      const result = await ratelimit.limit(identifier);
      expect(result.success).toBe(true);

      // Cleanup
      const keys = await redisClient.keys(`${testPrefix}*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      await redisClient.quit();
    });
  });
});
