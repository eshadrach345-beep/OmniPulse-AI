# Downloading finished videos

- Each scene has a Download link (the original clip).
- "Download full video" joins all scenes into one MP4 on the server using ffmpeg (package `ffmpeg-static`, already listed in package.json and included through vercel.json).
- If joining ever fails, check the function logs in Vercel. The scenes can always be downloaded one by one.

Note: downloads use the video address saved when a scene finished. They no longer ask the video provider (deAPI/fal) for status again, so they cannot fail with a "render status" error or use up the provider's daily status checks.

## Director's chair (v23)
The Story Studio now has a "Director's chair": Movie / Dialogue drama / Narrated story, 14 genres, action level, dialogue amount and ending.
The ids live in server/lib/prompts.ts (PRESENTATIONS, GENRES, INTENSITIES, DIALOGUE_LEVELS, ENDINGS) and src/data/storyOptions.ts. Change both together, then run `node scripts/build-api.mjs` so api/index.js is rebuilt.

## How scripts become scenes (v25)
- A pasted script goes to the AI first. It is broken down like a screenplay: spoken lines are said by the characters, actions are performed on screen, thoughts become pictures, and sounds become sound effects. If the AI is busy or fails, the built-in reader does the same job (server/lib/screenplay.ts).
- A line that only describes an action ("The lion fell.") is never spoken. Narration is kept only for the opening, a jump in time or place, and the close (except in Narrated stories and documentaries).
- Test the rules with `node scripts/test-screenplay.mjs`.
- Short drama series, 17 genres, animals and mythical creatures are chosen in the Story Studio. Add your own sample videos in src/data/showcase.ts.
