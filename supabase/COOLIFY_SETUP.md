# ReelStudio deployment checklist

The code supports Supabase Auth and private account projects. The existing live app remains on its previous pinned archive until its inline Dockerfile is updated.

## Dedicated service

A Supabase template service named `reelstudio-supabase` was created in the existing tscaps/production Coolify project. Resource ID: `f4ywxz8fg8ytzlzepjnx02as`. It has not yet been deployed or validated.

- Keep the generated database/JWT/admin secrets internal; retain dashboard authentication.
- Set the Kong route to HTTPS and verify its certificate before connecting the browser app.
- Site URL: `https://cap.yogeshaihub.in`.
- Additional redirect URLs: `https://cap.yogeshaihub.in/**,https://www.cap.yogeshaihub.in/**`.
- Verify GoTrue's public API/external URL and storage public URL resolve to the HTTPS Kong origin.
- The owner explicitly approved signup without email verification because SMTP is unavailable. Set email autoconfirm to true and keep frontend `AUTH_EMAIL_ENABLED=false` to hide unavailable email recovery. Configure SMTP and re-enable verification when mail is available.
- Storage `UPLOAD_FILE_SIZE_LIMIT` and `UPLOAD_FILE_SIZE_LIMIT_STANDARD` are both `524288000`, matching the private bucket's 500 MB limit.
- Apply `migrations/20261014_reelstudio_projects.sql` to the dedicated database after initialization. It is idempotent for this initial schema.
- Verify signup confirmation, login, recovery emails, project save/reopen from a fresh browser, video upload/download, and denial of cross-user access against the live service.
- Schedule backups for both Postgres and the storage volume.

## Existing frontend application

Coolify frontend resource ID: `hx7cwhzutj6hzkduvyarin7x`. It uses an inline Dockerfile with a pinned codeload archive and a custom template injection step. Preserve that custom step.

1. Update the archive to this repository's new commit.
2. Add these lines to its nginx runtime stage:

   ```dockerfile
   COPY --from=build /workspace/apps/studio/docker/40-reelstudio-config.sh /docker-entrypoint.d/40-reelstudio-config.sh
   RUN chmod +x /docker-entrypoint.d/40-reelstudio-config.sh
   ```

3. Set runtime `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Use only the public anon key. The entrypoint rejects service-role/server secret keys before writing the browser configuration.
4. Deploy and verify `https://cap.yogeshaihub.in/projects` presents sign in/sign up, with account projects after authentication.

No SMTP credentials, public anon key, or server secrets are stored in this repository. The browser's existing local projects remain available for import after login, or through `.tscaps` export/import between origins.
