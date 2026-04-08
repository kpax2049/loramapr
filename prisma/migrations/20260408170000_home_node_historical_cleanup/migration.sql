-- Home-node historical cleanup:
-- - keep raw webhook events intact
-- - remove home-derived measurement/session/coverage artifacts from normal product data paths
-- - preserve latest/current home location operationally via device read-path fallback to raw events

WITH home_devices AS (
  SELECT d."id"
  FROM "Device" d
  WHERE (
    LOWER(REGEXP_REPLACE(COALESCE(d."role", ''), '[^a-z0-9]+', ' ', 'g')) LIKE '%home%'
    OR LOWER(REGEXP_REPLACE(COALESCE(d."role", ''), '[^a-z0-9]+', ' ', 'g')) LIKE '%base%'
  )
)
DELETE FROM "CoverageBin" b
USING home_devices hd
WHERE b."deviceId" = hd."id";

WITH home_devices AS (
  SELECT d."id"
  FROM "Device" d
  WHERE (
    LOWER(REGEXP_REPLACE(COALESCE(d."role", ''), '[^a-z0-9]+', ' ', 'g')) LIKE '%home%'
    OR LOWER(REGEXP_REPLACE(COALESCE(d."role", ''), '[^a-z0-9]+', ' ', 'g')) LIKE '%base%'
  )
)
DELETE FROM "Measurement" m
USING home_devices hd
WHERE m."deviceId" = hd."id";

WITH home_devices AS (
  SELECT d."id"
  FROM "Device" d
  WHERE (
    LOWER(REGEXP_REPLACE(COALESCE(d."role", ''), '[^a-z0-9]+', ' ', 'g')) LIKE '%home%'
    OR LOWER(REGEXP_REPLACE(COALESCE(d."role", ''), '[^a-z0-9]+', ' ', 'g')) LIKE '%base%'
  )
)
DELETE FROM "Session" s
USING home_devices hd
WHERE s."deviceId" = hd."id";
