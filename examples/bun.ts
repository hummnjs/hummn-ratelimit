import { RedisClient } from "bun";
import { Ratelimit } from "../src/bun";

async function main() {
  const l = new Ratelimit({
    limiter: Ratelimit.tokenBucket(1, "1m", 10),
    redis: new RedisClient(),
  });

  const result = await l.limit("user");
  // biome-ignore lint: biome-ignore lint
  console.log(result);
}

await main();
