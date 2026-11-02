-- Replaces a reservation with the request's real cost.
--
-- KEYS[1]  ledger hash
-- KEYS[2]  reservations zset
-- ARGV[1]  reservation member
-- ARGV[2]  reserved amount
-- ARGV[3]  actual cost (0 to release without charging)
--
-- Returns the new `spent`, or -1 if the ledger is gone. In that case the
-- request's log row still reaches Postgres, and the next hydration counts it.

if redis.call('EXISTS', KEYS[1]) == 0 then
  return -1
end

-- If the sweeper already expired this reservation it also gave the amount
-- back, so only release it here when we are the ones removing it.
if redis.call('ZREM', KEYS[2], ARGV[1]) == 1 then
  redis.call('HINCRBY', KEYS[1], 'reserved', -tonumber(ARGV[2]))
end

local actual = tonumber(ARGV[3])
if actual > 0 then
  return redis.call('HINCRBY', KEYS[1], 'spent', actual)
end
return tonumber(redis.call('HGET', KEYS[1], 'spent') or '0')
