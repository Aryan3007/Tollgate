-- GCRA (generic cell rate algorithm) over several buckets at once.
-- Every bucket is checked before any is charged, so a request denied by the
-- team limit does not use up the key's quota.
--
-- KEYS[i]           bucket key (stores its theoretical arrival time, ms)
-- ARGV[3i-2]        emission interval: ms per unit (period / limit)
-- ARGV[3i-1]        period in ms (the burst window)
-- ARGV[3i]          cost in units (1 for requests, token estimate for TPM)
--
-- Returns {allowed (1|0), retry_after_ms, index of the denying bucket (0 if none)}

local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local new_tats = {}
for i = 1, #KEYS do
  local interval = tonumber(ARGV[3 * i - 2])
  local period = tonumber(ARGV[3 * i - 1])
  local cost = tonumber(ARGV[3 * i])

  local tat = tonumber(redis.call('GET', KEYS[i])) or now
  if tat < now then tat = now end

  local new_tat = tat + interval * cost
  local allow_at = new_tat - period
  if allow_at > now then
    return {0, math.ceil(allow_at - now), i}
  end
  new_tats[i] = new_tat
end

for i = 1, #KEYS do
  redis.call('SET', KEYS[i], new_tats[i], 'PX', math.max(1, math.ceil(new_tats[i] - now)))
end
return {1, 0, 0}
