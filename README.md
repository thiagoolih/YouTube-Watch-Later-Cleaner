# YouTube Watch Later Cleaner

[Português](README.pt-BR.md)

A small browser extension (Microsoft Edge, Google Chrome and other Chromium browsers) that **empties your "Watch later" playlist** in a few clicks, and can **add the videos back later from a backup file**.

It runs entirely in your browser, using the session you are already logged into. No API keys, no Google Cloud project, no external servers.

> Looking for the version that removes your *likes* instead? See **[YouTube Likes Cleaner](https://github.com/thiagoolih/YouTube-Likes-Cleaner)**.

## Features

- **Clean Watch later**: scrolls the playlist, collects every video and removes each one.
- **Automatic backup**: a `.json` file with the full list is downloaded *before* anything is removed.
- **Restore**: pick a backup file and the extension adds the videos back to Watch later.
- **Safe by default**: removing everything needs a second confirmation click, and you can limit the run to N videos to test first.
- **Progress panel** with a Stop button, automatic slow-down when YouTube rate-limits, and a summary at the end.
- **English and Portuguese (BR)** interface.

## Install (unpacked)

1. Download or clone this repository.
2. Open `edge://extensions` (Edge) or `chrome://extensions` (Chrome).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the project folder (the one that contains `manifest.json`).
5. Pin the extension to the toolbar.

## Usage

### Clean Watch later

1. Click the extension icon, then **Clean Watch later**. If you are not on the Watch later page, it opens it in a new tab; click the button again once it loads.
2. A panel appears at the bottom right. It loads the whole list and downloads the backup.
3. Type how many videos to remove (try **5** first) or leave it empty for all, then click **Remove**. For all videos, click again to confirm.
4. Reload the page to check the result.

### Restore from a backup

1. Open any YouTube page, click the extension icon, then **Restore from backup**.
2. Choose the `.json` file created earlier, optionally limit the quantity, and click **Restore**.

> Re-added videos get a new "date added" and their position depends on how YouTube sorts the playlist. The extension adds them from the end of the backup to the start, assuming new items land at the top, so the original order is recreated. If you notice the order came out reversed, that assumption does not hold for your account's sort setting.

### Backup format

```json
{
  "format": "youtube-watch-later-cleaner-backup",
  "version": 1,
  "exportedAt": "2026-10-09T12:00:00.000Z",
  "total": 2,
  "videos": [
    { "id": "dQw4w9WgXcQ", "title": "First video on the page" },
    { "id": "aaaaaaaaaaa", "title": "Second video on the page" }
  ]
}
```

A plain array of `{ "id", "title" }` objects is also accepted. Backups made by other tools (such as the likes cleaner) are rejected on purpose.

## How it works

The popup injects `src/inject.js` into the YouTube tab (in the page's own JavaScript context, which is required to read `window.ytcfg`). The script calls the internal endpoint the web client uses to edit playlists, `/youtubei/v1/browse/edit_playlist`, with the actions `ACTION_REMOVE_VIDEO_BY_VIDEO_ID` and `ACTION_ADD_VIDEO` on playlist `WL`, authenticated with the standard `SAPISIDHASH` header computed from your own session cookie.

The official YouTube Data API is not an option here: it no longer lets applications read or modify the Watch later playlist.

## Privacy

- Nothing is sent anywhere except to `youtube.com`, from your own browser.
- No analytics, no telemetry, no remote code.
- The only permissions are `scripting` and access to `https://www.youtube.com/*`.
- Backups are saved only to your computer's downloads folder.

## Limitations and disclaimer

- This project is **unofficial** and not affiliated with YouTube or Google.
- It relies on **internal, undocumented endpoints** that YouTube may change at any time, which could break the extension.
- Automating actions on your account may go against YouTube's Terms of Service. **Use at your own risk**, and keep the requests slow (the defaults already are).
- Removing videos is only reversible through the Restore feature or by adding them again manually. Keep the backup file.
- **The playlist video counter may take a while to update.** After cleaning, the header of the page may keep showing the old number even though the list is empty. This is YouTube-side caching and usually fixes itself within a few hours. To check, hard-reload with `Ctrl+Shift+R` or look again later.
- **Unavailable videos are not affected.** Deleted or private videos are hidden from the list and the extension cannot remove them. They may still be counted in the playlist total, and they cannot be restored.
- **Very large lists may need more than one run.** If anything is left after a cleanup, run the extension again.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| "No videos found" | Make sure you are logged into the right account and on `youtube.com/playlist?list=WL`. |
| Failures with status `400` or `-3` | The internal API may have changed. Open an issue with the console output (`F12`). |
| Status `401` / `403` | Your session is not valid. Reload YouTube and log in again. |
| Status `429` | YouTube is rate-limiting. The extension waits 60 s and retries automatically. |
| Nothing happens after clicking | Reload the YouTube tab, then try again. |
| Multiple Google accounts | The extension acts on the account currently active in the tab. Check it before confirming. |

## Development

```bash
npm install
npm test        # smoke tests (jsdom) for the clean and restore flows
```

Project layout:

```
manifest.json          Manifest V3
src/popup.*            Toolbar popup
src/inject.js          Page script: collection, backup, clean, restore
_locales/              Popup and manifest translations
icons/                 Extension icons
tests/smoke.test.js    Simulated-page tests
```

The panel shown on the YouTube page has its own small dictionary at the top of `src/inject.js`. To add a language, add an entry there and a new folder under `_locales/`.

## Contributing

Issues and pull requests are welcome, especially reports of YouTube changes that break the extension.

## License

[MIT](LICENSE)
