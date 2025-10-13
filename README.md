# Hummn Rate Limit

[![npm (scoped)](https://img.shields.io/npm/v/@hummn/ratelimit)](https://www.npmjs.com/package/@hummn/ratelimit)

Hummn Rate Limit is designed to help you limit the number of requests your application receives.

It is useful for:
- Bun: It has first-class support for [Bun Redis (Released in v1.2.3)](https://bun.com/docs/api/redis)
- Hono: Can be used with Hono in a node/bun environment. For serveless functions, we recommend using [@upstash/ratelimit](https://github.com/upstash/ratelimit-js)
- Node.js: It has first-class support for [Node Redis](https://github.com/redis/node-redis)
- Deno: Use the node adapter



## Quick Start

### Install

#### bun

```bash
bun add @hummn/ratelimit
```

#### npm

```bash
npm install @hummn/ratelimit redis
```

or

```bash
npm install @hummn/ratelimit @redis/client
```

#### Deno

```ts
import { HummnRatelimit } from "https://cdn.skypack.dev/@hummn/ratelimit@latest";
```

### Create a database
Create a database using Docker or any other method you prefer.

#### Docker

```sh
docker run -d --name hummn-with-redis -p 6379:6379 redis:latest
```

### Basic Usage

#### Bun
```ts
import { HummnRatelimit } from "@hummn/ratelimit"; // for deno: see above
import { RedisClient } from "bun";

// Create a new ratelimiter, that allows 10 requests per 10 seconds
const ratelimit = new HummnRatelimit({
  redis: new RedisClient(), // Bun can infer the url from env.REDIS_URL, env.VALKEY_URL or uses the default redis://localhost:6379
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  /**
   * Optional prefix for the keys used in redis. This is useful if you want to share a redis
   * instance with other applications and want to avoid key collisions. The default prefix is
   * "@hummn/ratelimit"
   */
  prefix: "@hummn/ratelimit",
});

// Use a constant string to limit all requests with a single ratelimit
// Or use a userID, apiKey or ip address for individual limits.
const identifier = "api";
const { success } = await ratelimit.limit(identifier);

if (!success) {
  return "Unable to process at this time";
}
runSomeFunction();
return "Here you go!";
```

#### Node
> [Note]
> Make sure to install the required dependencies. `npm install @redis/client` or `npm install redis`

```ts
import { HummnRatelimit } from "@hummn/ratelimit"; // for deno: see above
import { createClient } from "@redis/client";

// Create a new ratelimiter, that allows 10 requests per 10 seconds
const ratelimit = new HummnRatelimit({
  redis: createClient({url: 'redis://localhost:6379'}),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  /**
   * Optional prefix for the keys used in redis. This is useful if you want to share a redis
   * instance with other applications and want to avoid key collisions. The default prefix is
   * "@hummn/ratelimit"
   */
  prefix: "@hummn/ratelimit",
});

// Use a constant string to limit all requests with a single ratelimit
// Or use a userID, apiKey or ip address for individual limits.
const identifier = "api";
const { success } = await ratelimit.limit(identifier);

if (!success) {
  return "Unable to process at this time";
}
runSomeFunction();
return "Here you go!";
```


For more information on getting started, you can refer to [our documentation](https://hummn.dev/docs/ratelimit/gettingstarted).

[Here's a complete Hono example](https://github.com/cmion/ratelimit/tree/main/examples/hono)

## Documentation

See [the documentation](https://hummn.dev/docs/ratelimit/overview) for more information details about this package.

## Contributing


### Running tests
Coming soon
