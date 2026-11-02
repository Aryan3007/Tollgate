-- Releases reservations whose request never settled (process crash, lost
-- connection), so a dead request cannot hold budget forever.
--
-- KEYS[1]  ledger hash
-- KEYS[2]  reservations zset
-- ARGV[1]  now (epoch ms)
--
-- Returns the number of reservations released.

local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
if #expired == 0 then
  return 0
end

local total = 0
for _, member in ipairs(expired) do
  total = total + tonumber(string.match(member, ':(%d+)$'))
end

redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('HINCRBY', KEYS[1], 'reserved', -total)
end
return #expired
