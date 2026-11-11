# Video quality and finishing

This project can improve prompt consistency, scene planning, and output presentation, but no prompt or upscaler can guarantee that a generative video model will avoid face, hand, or continuity errors.

## Current quality controls

- The server selects from the video models actually reported by the provider and applies the configured preference/override rules.
- Model resolution and duration must follow the capabilities reported for that model. Do not force a larger canvas or unsupported duration.
- Scene prompts are assembled with character and shot context. This helps consistency but does not guarantee identical faces or wardrobe across independently generated shots.
- Video QA can flag some visual problems. A passing automated check is not proof that every frame is visually correct; inspect important clips before publishing.

## Cost safety

- `DEAPI_VIDEO_MODEL` pins a specific model. Only set it after checking that model's current price and supported duration in the provider dashboard.
- `DEAPI_MODEL_PREFERENCE` controls preference order where supported. Do not assume the first available model is the cheapest.
- Avoid production renders while testing provider/model settings. Use a low-cost test model and a short test only when you have explicitly approved the spend.
- Provider model names, availability, limits, and prices can change. Confirm them in the provider dashboard before changing production settings.

## Optional local finishing

After downloading a generated clip, you can optionally run:

```bash
node scripts/finish-video.mjs input.mp4 output.mp4
```

The script uses FFmpeg to denoise lightly, upscale to a chosen output height (default 1920), apply a subtle grade, add optional grain, and encode H.264. It does **not** repair malformed faces, extra limbs, incorrect actions, or continuity errors. Upscaling increases pixel dimensions; it does not recreate missing detail.

Options:

- `--height 1920`: output height, clamped to 480–2160.
- `--grade cinematic|warm|cool|none`: color treatment.
- `--grain 3`: subtle grain amount, 0–20.
- `--smooth`: optional motion interpolation; can create artifacts and takes longer.
- `--crf 19`: H.264 quality setting; lower values produce larger files.

Use the output as a presentation pass, not as a substitute for reviewing the original render.
