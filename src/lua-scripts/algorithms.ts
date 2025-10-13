export const fixedWindowLimitScript = `
  local key         = KEYS[1]
  local window      = tonumber(ARGV[1])
  local incrementBy = tonumber(ARGV[2])

  if not window or window <= 0 then
    return redis.error_reply("Invalid window")
  end

  if not incrementBy then
    return redis.error_reply("Invalid incrementBy")
  end

  -- Check if key exists before incrementing
  local exists = redis.call("EXISTS", key)

  -- Increment the counter
  local count = redis.call("INCRBY", key, incrementBy)

  -- Set expiration if key didn't exist
  if exists == 0 then
    redis.call("PEXPIRE", key, window)
  end

  return count
`;

export const fixedWindowRemainingTokensScript = `
 return tonumber(redis.call('GET', KEYS[1])) or 0
`;

export const slidingWindowLimitScript = `
  local currentKey  = KEYS[1]                    -- identifier including prefixes
  local previousKey = KEYS[2]                    -- key of the previous bucket
  local tokens      = tonumber(ARGV[1])          -- tokens per window
  local now         = tonumber(ARGV[2])          -- current timestamp in milliseconds
  local window      = tonumber(ARGV[3])          -- interval in milliseconds
  local incrementBy = tonumber(ARGV[4])          -- increment rate per request at a given value, default is 1

  -- Validate inputs
  if not tokens or tokens <= 0 then
    return redis.error_reply("Invalid tokens")
  end
  if not now or now <= 0 then
    return redis.error_reply("Invalid timestamp")
  end
  if not window or window <= 0 then
    return redis.error_reply("Invalid window")
  end
  if not incrementBy or incrementBy <= 0 then
    return redis.error_reply("Invalid incrementBy")
  end

  local requestsInCurrentWindow = redis.call("GET", currentKey)
  if requestsInCurrentWindow == false then
    requestsInCurrentWindow = 0
  end

  local requestsInPreviousWindow = redis.call("GET", previousKey)
  if requestsInPreviousWindow == false then
    requestsInPreviousWindow = 0
  end
  local percentageInCurrent = ( now % window ) / window
  -- weighted requests to consider from the previous window
  requestsInPreviousWindow = math.floor(( 1 - percentageInCurrent ) * requestsInPreviousWindow)
  if requestsInPreviousWindow + requestsInCurrentWindow >= tokens then
    return -1
  end

  local newValue = redis.call("INCRBY", currentKey, incrementBy)
  if newValue == tonumber(incrementBy) then
    -- The first time this key is set, the value will be equal to incrementBy.
    -- So we only need the expire command once
    redis.call("PEXPIRE", currentKey, window * 2 + 1000) -- Enough time to overlap with a new window + 1 second
  end
  return tokens - ( newValue + requestsInPreviousWindow )
`;

export const slidingWindowRemainingTokensScript = `
  local currentKey  = KEYS[1]           -- Current window key (e.g., "ratelimit:user:123:1234567")
  local previousKey = KEYS[2]           -- Previous window key (e.g., "ratelimit:user:123:1234566")
  local now         = tonumber(ARGV[1]) -- Current timestamp in milliseconds
  local window      = tonumber(ARGV[2]) -- Window size in milliseconds (e.g., 60000 for 1 minute)

  -- Get the count of requests in the current window
  -- Redis GET returns false if key doesn't exist, convert to number or default to 0
  local current = tonumber(redis.call("GET", currentKey)) or 0

  -- Get the count of requests in the previous window
  -- Redis GET returns false if key doesn't exist, convert to number or default to 0
  local previous = tonumber(redis.call("GET", previousKey)) or 0

  -- Calculate how far we are into the current window (0.0 to 1.0)
  -- Example: if now=30000 and window=60000, percentage = 0.5 (50% through window)
  local percentageInCurrent = (now % window) / window

  -- Calculate weighted count from previous window
  -- As we move further into current window, previous window matters less
  -- Example: if 50% into current window, previous window weight is 50%
  local weightedPrevious = math.floor((1 - percentageInCurrent) * previous)

  -- Return the total estimated request count in the sliding window
  return current + weightedPrevious
`;

export const tokenBucketLimitScript = `
  -- Token Bucket Rate Limiter: Refills tokens over time, allows bursts up to maxTokens
  local key         = KEYS[1]           -- Bucket identifier
  local maxTokens   = tonumber(ARGV[1]) -- Maximum bucket capacity
  local interval    = tonumber(ARGV[2]) -- Refill interval in milliseconds
  local refillRate  = tonumber(ARGV[3]) -- Tokens added per interval
  local now         = tonumber(ARGV[4]) -- Current timestamp in milliseconds
  local incrementBy = tonumber(ARGV[5]) -- Tokens to consume (default: 1)

  -- Get current bucket state (last refill time and token count)
  local bucket = redis.call("HMGET", key, "refilledAt", "tokens")

  local refilledAt
  local tokens

  -- Initialize new bucket or load existing state
  if bucket[1] == false then
    refilledAt = now
    tokens = maxTokens
  else
    refilledAt = tonumber(bucket[1])
    tokens = tonumber(bucket[2])
  end

  -- Calculate and apply token refills for elapsed intervals
  if now >= refilledAt + interval then
    local numRefills = math.floor((now - refilledAt) / interval)
    tokens = math.min(maxTokens, tokens + numRefills * refillRate)
    refilledAt = refilledAt + numRefills * interval
  end

  -- Check if enough tokens available
  if tokens < incrementBy then
    local tokensNeeded = incrementBy - tokens
    local intervalsNeeded = math.ceil(tokensNeeded / refillRate)
    local retryAfter = refilledAt + (intervalsNeeded * interval)
    return {0, maxTokens, 0, retryAfter - now}
  end

  -- Consume tokens
  local remaining = tokens - incrementBy

  -- Set expiration based on time to refill bucket
  local tokensToRefill = maxTokens - remaining
  local intervalsToRefill = math.ceil(tokensToRefill / refillRate)
  local expireAt = intervalsToRefill * interval * 2

  -- Save state
  redis.call("HSET", key, "refilledAt", refilledAt, "tokens", remaining)
  redis.call("PEXPIRE", key, expireAt)

  -- Return: success, limit, remaining, milliseconds until next token
  local resetAt = refilledAt + interval
  return {1, maxTokens, remaining, resetAt - now}
`;

export const tokenBucketIdentifierNotFound = -1;

export const tokenBucketRemainingTokensScript = `
  local key       = KEYS[1]           -- Bucket identifier
  local maxTokens = tonumber(ARGV[1]) -- Maximum bucket capacity

  -- Get current bucket state
  local bucket = redis.call("HMGET", key, "refilledAt", "tokens")

  -- If bucket doesn't exist, return max tokens and -1 for timestamp
  if bucket[1] == false or bucket[1] == nil then
    return {maxTokens, -1}
  end

  -- Return: remaining tokens, last refill timestamp
  return {tonumber(bucket[2]), tonumber(bucket[1])}
`;
