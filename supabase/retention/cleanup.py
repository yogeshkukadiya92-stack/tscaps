"""Server-only video retention worker. Never ship its credentials to the browser."""
import json
import os
import time
import urllib.request
from urllib.error import HTTPError, URLError

BUCKET = 'reelstudio-videos'


def request_json(base, key, path, method, payload):
    request = urllib.request.Request(
        base.rstrip('/') + path,
        data=json.dumps(payload).encode(), method=method,
        headers={'apikey': key, 'Authorization': 'Bearer ' + key,
                 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read()
        return json.loads(body) if body else None


def cleanup_once(base, key, request=request_json):
    rows = request(base, key, '/rest/v1/rpc/reelstudio_expired_videos', 'POST', {})
    if not isinstance(rows, list):
        raise ValueError('Invalid retention response')
    if not rows:
        return 0
    names = [row['name'] for row in rows]
    if len(names) > 500 or any(not isinstance(name, str) or not name for name in names):
        raise ValueError('Invalid retention candidates')
    # Do not delete project rows: caption edits remain available for relinking.
    request(base, key, '/storage/v1/object/' + BUCKET, 'DELETE', {'prefixes': names})
    return len(names)


def main():
    base = os.environ['SUPABASE_URL']
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    if not base.startswith('https://'):
        raise ValueError('SUPABASE_URL must use HTTPS')
    while True:
        try:
            count = cleanup_once(base, key)
            print(f'Retention pass completed: {count} expired videos processed', flush=True)
        except HTTPError as error:
            print(f'Retention request failed (HTTP {error.code}); retrying next minute', flush=True)
        except (URLError, TimeoutError, ValueError, KeyError):
            # Never log credentials, request headers, or provider response bodies.
            print('Retention pass failed; retrying next minute', flush=True)
        time.sleep(60)


if __name__ == '__main__':
    main()
