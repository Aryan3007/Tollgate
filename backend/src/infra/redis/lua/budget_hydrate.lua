-- Creates a ledger from Postgres totals if no other instance did first.
--
-- KEYS[1]  ledger hash
-- ARGV[1]  spent so far this month (from request_logs)
-- ARGV[2]  TTL seconds
--
-- Returns 1 if this call created the ledger, 0 if it already existed.

if redis.call('HSETNX', KEYS[1], 'spent', ARGV[1]) == 0 then
  return 0
end
redis.call('HSET', KEYS[1], 'reserved', 0)
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 1
