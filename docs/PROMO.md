# Promo / Bilibili package

The public repository ships the sanitized images and the showcase page:
`docs/index.html` (GitHub Pages → `/docs`). The 2560×1600 promo video, BGM,
voice stems and cover are release assets, not repository blobs.

## Public video facts

- Resolution: 2560 × 1600, 30 fps, H.264 + AAC stereo.
- Runtime: ~65 s.
- Voice: Edge TTS (zh-CN-XiaoxiaoNeural) → local DDSP-SVC conversion.
- Music: original procedural guofeng cue (D pentatonic, plucked strings, flute,
  low drum, cymbal); no third-party samples.
- Screenshots: actual HUD at 2560×1600; DOM redacted (DEMO session, demo paths,
  generic folder names); no live transcript.
- Hardware values: captured from the local HUD; unavailable CPU/disk sensors are
  shown as N/A, not fabricated.

## Copy

See the local `bilibili_publish.md` next to the video for title, description,
tags, cover and upload checklist. Do not claim a Q1/benchmark result or a rank
that was not independently verified.

## Attribution

Cat artwork: user-provided, included with permission (see `NOTICE`). Code and
documentation: MIT.
