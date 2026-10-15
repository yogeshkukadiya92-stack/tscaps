# Cloud video retention

Videos in the private `reelstudio-videos` bucket expire 48 hours after the storage object's first creation, including videos belonging to deleted projects and orphan uploads. Editing/saving project metadata does not extend retention. Replacing an existing object at the same path does not extend its original lifetime. After deletion, a new upload gets a new lifetime.

The worker checks every minute and processes up to 500 objects per pass. Healthy, small queues are normally cleared within a minute after expiry; downtime and large backlogs delay deletion. Cleanup uses the Storage API to remove file bytes as well as metadata. Project records, thumbnails and captions are retained. Existing local caches may still provide the source on that device; otherwise users must relink the original video.

## Enable on Coolify

1. Apply `supabase/migrations/20261017_reelstudio_video_retention.sql` to the dedicated Supabase database.
2. Create an always-running Docker application from this repository, with build context `/supabase/retention` and Dockerfile `/Dockerfile`. No public domain or port is needed. Enable restart on failure.
3. Set private runtime secrets `SUPABASE_URL` (HTTPS Kong origin) and `SUPABASE_SERVICE_ROLE_KEY` (dedicated service's service-role key). Never put this key in Vite, browser config, or the frontend application.
4. Deploy one worker replica. Check logs for `Retention pass completed`; alert on repeated failures or missing passes.
5. Verify with a disposable expired object: the worker should remove its Storage listing and bytes while preserving its project row. Verify a fresh object remains and an authenticated user cannot call the retention RPC. Do not backdate or delete real customer videos for testing.

Applying this policy includes existing objects already over 48 hours old. The worker performs deletion as soon as it starts. Deploy the frontend retention notice alongside activation. Local implementation alone does not enable live cleanup.

Run unit checks with `python3 -m unittest discover -s supabase/retention -p 'test_*.py'`.
