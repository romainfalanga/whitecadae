// Temporary product hold: keep the implementation and saved data, expose none
// of the Playlist page, unlock schedule, CRUD or native audio transport.
// This is a source decision, never a request parameter or public setting.
export const PLAYLISTS_ENABLED=false;

// Loge posts are now shared from the member's own videography. Direct Stream
// uploads and YouTube links stay implemented for the posts they already carry,
// but new ones are refused. Tests enable them through an explicit dependency.
export const LOGE_LEGACY_SOURCES=false;
