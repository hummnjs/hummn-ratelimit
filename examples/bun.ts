import { RedisClient } from "bun";
import { HummnRatelimit } from "../src/bun";

async function main() {
  const l = new HummnRatelimit({
    limiter: HummnRatelimit.tokenBucket(2, "1m", 10),
    redis: new RedisClient(),
  });

  const result = await l.limit("user");
  // biome-ignore lint: biome-ignore lint
  console.log(result);
}

await main();
