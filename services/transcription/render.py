"""Render the saved cloud project through the same compositor in an isolated browser."""
import asyncio
import base64
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse


async def render_project(project_id, token, user, folder, output_format):
    from playwright.async_api import async_playwright
    origin = os.environ['EDITOR_ORIGIN'].rstrip('/')
    if urlparse(origin).scheme != 'https':
        raise ValueError('EDITOR_ORIGIN must be HTTPS')
    payload = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '==='))
    expires = payload.get('exp', 0)
    if expires - time.time() < 1800:
        raise ValueError('Refresh your session before server export')
    session = {'access_token': token, 'refresh_token': '', 'token_type': 'bearer',
               'expires_at': expires, 'expires_in': int(expires - time.time()), 'user': user}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            context = await browser.new_context(accept_downloads=True, viewport={'width': 1440, 'height': 1000})
            await context.add_init_script('if(location.origin === ' + json.dumps(origin) + ') localStorage.setItem("reelstudio-auth", ' + json.dumps(json.dumps(session)) + ');')
            page = await context.new_page()
            await page.goto(origin + '/project/' + project_id + '?serverRender=1', wait_until='domcontentloaded')
            await page.get_by_role('tab', name='Creative', exact=True).click(timeout=120000)
            workspace = page.get_by_role('region', name='Creative Studio', exact=True)
            # Render WebM with Chromium's software encoder; MP4 conversion happens after composition.
            await workspace.get_by_role('combobox', name='Export format', exact=True).select_option('webm')
            await workspace.get_by_role('button', name='Render edited reel', exact=True).click(timeout=120000)
            await page.wait_for_function('''() => {
              const root = document.querySelector('[aria-label="Creative Studio"]');
              return root && (Array.from(root.querySelectorAll('button')).some(b => b.textContent.trim() === 'Download reel') || root.querySelector('[role="alert"]'));
            }''', timeout=25 * 60 * 1000)
            alerts = await workspace.get_by_role('alert').all_text_contents()
            if alerts:
                raise RuntimeError('The project could not be rendered')
            async with page.expect_download(timeout=30000) as waiting:
                await workspace.get_by_role('button', name='Download reel', exact=True).click()
            download = await waiting.value
            source = str(Path(folder) / 'reel.webm')
            await download.save_as(source)
            if await download.failure():
                raise RuntimeError('Render download failed')
        finally:
            await browser.close()
    if output_format == 'webm':
        return source
    target = str(Path(folder) / 'reel.mp4')
    process = await asyncio.create_subprocess_exec('ffmpeg', '-nostdin', '-v', 'error', '-i', source,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-threads', '4',
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', target,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    try:
        await asyncio.wait_for(process.wait(), timeout=600)
    except BaseException:
        process.kill()
        await process.wait()
        raise
    if process.returncode:
        raise RuntimeError('MP4 encoding failed')
    return target
