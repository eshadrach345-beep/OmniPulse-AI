# Series: projects, episodes and episodic memory

A **project** is one story. Its **episodes** are its parts (Part 1, Part 2, ...). Tables: `projects` and `episodes` (created automatically by `server/lib/db.ts`; `prisma/schema.prisma` describes the same tables for Prisma tooling).

## Why it never hits the serverless time limit
Nothing slow runs in the request that starts a part.

| Step | Route | What happens |
|---|---|---|
| 1 | `POST /api/episodes/create` | Saves the episode as `PROCESSING` and answers immediately (HTTP 202). |
| 2 | `GET /api/episodes/status?id=` | Moves the episode forward by **one bounded step** and returns its state. The Series screen polls this every 4 seconds. |
| 3 | `GET /api/cron/dispatch` | Also advances episodes nobody has polled for 2 minutes (tab closed). Needs `CRON_SECRET`, pinged every 5 minutes. |

State machine: `PROCESSING` (write the storyboard) → `RENDERING` (send every scene to the video provider with `Promise.all`, then follow them; a scene that fails is sent once more) → `COMPLETED`, or `FAILED` with the reason in `episodes.error`. Every step takes a short database lease (`locked_until`), so two requests never run the same step, and a step lost with its serverless instance is retried when the lease runs out. A part older than 45 minutes is stopped.

Scenes that fail do not use video seconds (they are not counted in `video_jobs`). A failed part gives its number back: the next "Generate Next Part" reuses it.

## Episodic memory
For Part N (N ≥ 2) the writer prompt starts with: *"You are writing Part N of an ongoing cinematic series. Ensure narrative, character behavior, and environmental continuity directly follow the conclusion of the previous section provided here."* followed by data read from Neon for Part N-1:
- the running **story so far** (`storyboard_json.storySoFar`, rewritten by the writer every part, so the context stays small however long the series gets),
- the previous part's title and logline,
- its **final scene** (picture and spoken line),
- the **cast** from `projects.character_db`, with each character's visual description to be copied word for word. The first character is locked into every scene's picture description.

Part N+1 cannot start until Part N is `COMPLETED`, and only one part per project can be in progress.

## The finished video
`finalVideoUrl` is `/api/episodes/video?id=...`. That route joins the scene clips with fluent-ffmpeg (`-f concat`, `-movflags +faststart`) in its own request and streams the MP4. The joined file is not stored: this project has no file storage. To keep it, upload the result to object storage (for example Vercel Blob) at the end of `completeEpisode()` in `server/handler.ts` and save that URL in `final_video_url`.


## Updates (script modes, delivery, scene length)
- **Who writes it:** "AI writes it" (title and instructions) or "I will paste my script". A pasted script keeps your story, names and wording; the AI adds the pictures, camera work and voices. A pasted script is turned into parts of up to 8 scenes; whatever does not fit is saved and used for the next part (or you paste more).
- **Series delivery:** "Make the whole series now" (all parts, one after another, automatically; the next part starts when the last one finishes while someone has the page open or a cron job is running) or "One part at a time".
- **Length:** from 20 seconds to 10 minutes per part. Scenes are 20 seconds (two clips) or 10 seconds. Long parts are written in chunks so no request ever has to write a whole film at once.
- **Next part:** Generate Next Part lets the AI write what happens next (with optional instructions) or lets you paste the next scenes.
- **Retry:** a stopped part keeps every clip that finished; Retry makes only the missing ones.
