-- Retire monthly recaps without deleting their videos, dates or comments.
UPDATE circle_topics SET revision=revision+1
WHERE kind='creation' AND event_id IN (SELECT id FROM life_events WHERE video_branch='monthly');
UPDATE life_events SET video_branch='ideas',video_month=NULL,revision=revision+1 WHERE video_branch='monthly';
