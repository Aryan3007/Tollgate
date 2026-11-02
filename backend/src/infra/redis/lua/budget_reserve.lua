-- Atomically checks a team's monthly budget and reserves an estimated cost.
-- Because check and reserve happen in one script, 100 parallel requests can
-- never together reserve more than the cap.
--
-- KEYS[1]  ledger hash {spent, reserved} (micro-rupees)
-- KEYS[2]  reservations zset: member "<request id>:<amount>", score = expiry ms
-- ARGV[1]  cap
-- ARGV[2]  amount to reserve
-- ARGV[3]  reservation member
-- ARGV[4]  reservation expiry (epoch ms)
-- ARGV[5]  TTL for both keys, seconds
--
-- Returns {status, remaining}: status 1 = reserved, 0 = over budget,
-- -1 = ledger missing (caller hydrates it from Postgres and retries).

if redis.call('EXISTS', KEYS[1]) == 0 then
  return {-1, 0}
end

local cap = tonumber(ARGV[1])
local amount = tonumber(ARGV[2])
local spent = tonumber(redis.call('HGET', KEYS[1], 'spent') or '0')
local reserved = tonumber(redis.call('HGET', KEYS[1], 'reserved') or '0')
local remaining = cap - spent - reserved

if amount > remaining then
  return {0, remaining}
end

redis.call('HINCRBY', KEYS[1], 'reserved', amount)
redis.call('ZADD', KEYS[2], ARGV[4], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[5])
return {1, remaining - amount}
