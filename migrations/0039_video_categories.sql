-- Preserve existing videos, notes and comments when retiring this category.
UPDATE circle_topics SET revision=revision+1
WHERE kind='creation' AND event_id IN (SELECT id FROM life_events WHERE video_branch='society');
UPDATE life_events SET video_branch='ideas', revision=revision+1 WHERE video_branch='society';
