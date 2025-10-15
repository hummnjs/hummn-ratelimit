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
import { HummnRatelimit } from "@hummn/ratelimit";
import { RedisClient, type BunRequest } from "bun";

const ratelimit = new HummnRatelimit({
  redis: new RedisClient('redis://localhost:6379'),
  // fixedWindow and slidingWindow also supported.
  limiter: Ratelimit.tokenBucket(10, "20 s", 100), 
  prefix: "@hummn/ratelimit",
});

Bun.serve({
  routes: {
    "/orgs/:orgId/repos/:repoId/settings": (
      req: BunRequest<"/orgs/:orgId/repos/:repoId/settings">,
    ) => {
      const { orgId, repoId } = req.params;
      // Use a constant string to limit all requests with a single ratelimit
      // Or use a userID, apiKey or ip address for individual limits.
      const identifier = `organization.${orgId}`;
      const { success } = await ratelimit.limit(identifier);
      if (!success) {
        // Set Headers
        return new Response("Woah! please slow down...", {status: 429})
      }
          
      return Response.json({ orgId, repoId });
    },
  },
});
```

#### Node
> [Note]
> Make sure to install the required dependencies. `npm install @redis/client` or `npm install redis`

```ts
import { HummnRatelimit } from "@hummn/ratelimit"; // for deno: see above
import { createClient } from "@redis/client";
import { Hono } from 'hono'

const app = new Hono();

const ratelimit = new HummnRatelimit({
  redis: createClient({url: 'redis://localhost:6379'}),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  prefix: "@hummn/ratelimit",
});

const ratelimitMiddleware = () => {
  return createMiddleware(async (c, next) => {
    const userId = c.get('userId');
    const path = c.req.path;
    const identifier = `user.${userId}.${path}`
    const { success } = await ratelimit.limit(identifier);
    if(!success) {
      // Set Headers
      return c.json({message: 'Woah!!, please slow down...'}, 429)
    }

    await next()
  })
}

app.use(ratelimitMiddleware())

```


For more information on getting started, you can refer to [our documentation](https://hummn.dev/docs/ratelimit/gettingstarted).

[Here's a complete Hono example](https://github.com/cmion/ratelimit/tree/main/examples/hono)

## Documentation

See [the documentation](https://hummn.dev/docs/ratelimit/overview) for more information details about this package.

## Contributing


### Running tests
Coming soon
