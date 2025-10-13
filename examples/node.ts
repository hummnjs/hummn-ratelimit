import { createClient } from "@redis/client";
import { HummnRatelimit } from "../src/node";

async function main() {
  const l = new HummnRatelimit({
    // limiter: HummnRatelimit.fixedWindow(60, "1m"),
    limiter: HummnRatelimit.tokenBucket(2, "1m", 10),
    redis: createClient(),
  });

  const result = await l.limit("user");
  // biome-ignore lint: biome-ignore lint
  console.log(result);
  process.exit(0);
}

await main();
