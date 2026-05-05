Drop your TikTok-style 9:16 vertical mp4 clips here:

  demo1.mp4   <- hero "phone" video
  ugc1.mp4    <- UGC grid card 1
  ugc2.mp4    <- UGC grid card 2
  ugc3.mp4    <- UGC grid card 3
  ugc4.mp4    <- UGC grid card 4
  ugc5.mp4    <- UGC grid card 5
  ugc6.mp4    <- UGC grid card 6

Tips:
- Keep each clip under 5 MB. ffmpeg snippet:
    ffmpeg -i in.mov -vf "scale=720:-2" -c:v libx264 -preset slow -crf 26 -an -movflags +faststart out.mp4
- Strip audio (-an) — videos autoplay muted anyway and silent files load faster.
- Cards keep playing only while in view, so 5–10 second loops convert best.
