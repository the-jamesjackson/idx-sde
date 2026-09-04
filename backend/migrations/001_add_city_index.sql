-- Index L_City so city filters can use it.
--
-- Both search routes used to match with LOWER(TRIM(L_City)) = LOWER(TRIM(?)).
-- Wrapping the column in functions makes the predicate non-sargable: MySQL cannot
-- use an index on L_City and full-scans rets_property for every city search.
--
-- src/db/cities.js now resolves a user-supplied city name to the exact spellings
-- stored in this column, so the routes compare with L_City IN (...) instead and
-- this index applies.
--
-- Run with:
--   mysql -u <user> -p <database> < migrations/001_add_city_index.sql
--
-- On a table this size the ALTER takes a while and holds a metadata lock at the
-- start and end of the operation. Run it during a quiet period.

CREATE INDEX idx_rets_property_city ON rets_property (L_City);
