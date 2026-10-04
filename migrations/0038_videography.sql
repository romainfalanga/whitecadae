-- Existing narratives remain private archives; no automatic video conversion.
ALTER TABLE life_events ADD COLUMN video_branch TEXT CHECK(video_branch IS NULL OR video_branch IN('self','ideas','projects','society','monthly'));
ALTER TABLE life_events ADD COLUMN video_month TEXT CHECK(video_month IS NULL OR (length(video_month)=7 AND video_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'));
CREATE INDEX idx_video_journal ON life_events(owner_id,video_branch,sort_date DESC,id DESC);
CREATE UNIQUE INDEX idx_video_monthly ON life_events(owner_id,video_month) WHERE video_branch='monthly';
