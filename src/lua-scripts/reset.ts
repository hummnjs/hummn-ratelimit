export const resetScript = `
  -- Pattern Cleanup Script (Optimized for Rate-Limiter Tokens)
  local pattern     = KEYS[1]
  local cursor      = ARGV[1] or "0"
  local batch_size  = tonumber(ARGV[2]) or 100
  local max_deletes = tonumber(ARGV[3]) or 1000

  local deleted = 0

  repeat
    local scan_result = redis.call("SCAN", cursor, "MATCH", pattern, "COUNT", batch_size)
    cursor = tostring(scan_result[1])
    local keys = scan_result[2]

    if #keys > 0 then
      deleted = deleted + redis.call("UNLINK", unpack(keys))
    end

    if deleted >= max_deletes then
      break
    end
  until cursor == "0"

  return {deleted, cursor}
`;
