/*
# Clean up Hotel Sunshine duplicate records

## Purpose
Archive 5 duplicate "Hotel Sunshine" records, keeping only the oldest one (06af300b).
All 6 duplicates have the same data (settings + 6 categories + 4 sources, 0 rooms/features/admins).
The first created record (06af300b) is kept as the master.

## Action
- Set is_active = false, onboarding_status = 'archived', archived_at = now() for 5 duplicate IDs
- Do NOT delete — archive only, so data is recoverable
- The kept record (06af300b) stays is_active = true, onboarding_status = 'completed'
*/

UPDATE hotels
SET is_active = false,
    onboarding_status = 'archived',
    archived_at = now()
WHERE id IN (
  'dbfb6162-8bca-479f-b620-ad8ca2ddae7c',
  '0001a003-0ec4-4d04-9c34-1e5a961993ac',
  'dc1bb236-6df9-45e4-96aa-8f7302ff00e8',
  'e4600c4d-eaa7-4d15-a38b-78cbb5b4a05f',
  'd7f981f6-36d0-4707-b95e-11abd096c909'
);
