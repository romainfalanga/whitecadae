# Loge virtuelle — Cloudflare Stream

New publications use a direct file upload to Stream. Existing YouTube posts and
comments remain readable; no source video is extracted from YouTube. New Stream
posts render through our own HTML video element and pinned, same-origin hls.js
(Safari uses native HLS). Playback starts paused, with sound enabled on explicit
play. Scrolling away, navigation, music playback and hidden tabs pause media.
Opening comments does not replace the video; fullscreen exits before the panel
opens so the discussion remains visible.

## Configuration

Wrangler binds Stream as `STREAM`; no API token is exposed or stored in D1.
`pnpm install --frozen-lockfile` followed by `pnpm test` prepares the vendored
HLS module and license. `pnpm run deploy:ci` tests, builds, deploys and verifies
the exact source revision. Migration 0050 adds the upload ownership ledger;
the same additive schema is initialized by the API for existing installations.

## Limits and lifecycle

- Earned level 15, active authenticated account, existing publication quota.
- One publication per rolling seven days. Uploading alone does not spend it.
- 200 MB per file, 30 minutes maximum, upload URL valid for one hour.
- One active upload per member and space (Loge or Vidéographie), up to three
  allocations per hour across both spaces. Deleting media still reserve budget.
- Conservative local reservation ceiling: 1,000 stored minutes. Stream also
  enforces the shared account's subscription capacity.
- Files transfer directly to Stream using multipart POST. Interrupted transfers
  restart rather than resume by byte. Processing is polled before retrying.
- A lost browser draft can cancel its previous owner-scoped upload and restart.
- Signed HLS/poster URLs are issued only after level and ownership checks.
- Deleted posts retain the ownership ledger until their provider media is deleted.
- Maintenance runs every 15 minutes, reconciles up to five ambiguous creations
  and cleans up at most 20 owned videos. Failures are retried with backoff.
- Provider safety deletion is scheduled 31 days after upload expiry and cleared
  before publication. Normal cancellation/deletion is explicit and much sooner.
- Resetting an account retains this ledger so orphaned billable media can be
  removed. Exact server-authored metadata prevents deleting unrelated videos.

## Validation

459 automated tests pass, including upload quota/concurrency/ownership, cancelled
and ambiguous creation, expired uploads, signed playback, stale UI requests,
fullscreen discussion, paused native/HLS players and legacy YouTube behavior.
Wrangler dry-run includes the native Stream binding. An isolated temporary
Worker successfully uploaded and encoded a two-second synthetic video through
the actual binding, generated a signed token, and fetched its HLS manifest and
poster (HTTP 200). Temporary provider resources are deleted after validation.
Local Chromium could not start because its socket operation is unavailable in
this execution environment; real-device visual playback is not asserted.
