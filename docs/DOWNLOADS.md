# Downloading finished videos

- Each scene has a Download link (the original clip).
- "Download full video" joins all scenes into one MP4 on the server using ffmpeg (package `ffmpeg-static`, already listed in package.json and included through vercel.json).
- If joining ever fails, check the function logs in Vercel. The scenes can always be downloaded one by one.
