# Promo / Bilibili package

The public repository ships the sanitized images and the showcase page:
`docs/index.html` (GitHub Pages → `/docs`). The 2560×1600 promo video, subtitle
files and cover are release assets, not repository blobs.

## Public video facts

- Resolution: 2560 × 1600, 30 fps, H.264 + AAC stereo.
- Runtime: 60.0 s.
- No voiceover. Information is carried by burned ASS subtitles (plus SRT/ASS).
- Song: “I Really Want to Stay at Your House”, excerpt 30.046–90.046 s,
  user-provided local file. **No license is claimed; copyright remains with the
  rights holders. Bilibili may flag/mute/block it.**
- Edit: 123 BPM; 15 shots at 8-beat boundaries; point-beam overlays and white
  flash on cuts.
- Screenshots: actual HUD at 2560×1600; DOM redacted (DEMO session, demo paths,
  generic folder names); no live transcript.
- Hardware values: captured from the local HUD; unavailable CPU/disk sensors are
  shown as N/A, not fabricated.

## Copy

See the local `bilibili_publish.md` next to the video for title, description,
tags, cover, music copyright note and upload checklist.

## Attribution

Cat artwork: user-provided, included with permission (see `NOTICE`). Code and
documentation: MIT. Music is **not** covered by the repository license.
