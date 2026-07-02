# Gemini Omni + Interactions API — Research Findings

Research date: 2026-07-02. Status snapshot as of that date — this is a fast-moving preview surface (SDK had a "completely replaced" internal rewrite of the interactions implementation on 2026-06-19, v2.9.0), so re-verify against `ai.google.dev` before building.

Sources (official, prioritized):
- https://ai.google.dev/gemini-api/docs/omni — Omni Flash video generation/editing guide (primary source for #2/#3)
- https://ai.google.dev/gemini-api/docs/interactions/interactions-overview — Interactions API conceptual overview
- https://ai.google.dev/api/interactions-api — Interactions API full reference (fields/endpoints/enums)
- https://ai.google.dev/gemini-api/docs/models/gemini-omni-flash — Omni Flash model card
- https://ai.google.dev/gemini-api/docs/video — Video generation overview (Omni vs Veo 3.1)
- https://ai.google.dev/gemini-api/docs/pricing — Pricing page (Omni Flash rates)
- https://ai.google.dev/gemini-api/docs/files (and /file-input-methods) — Files API (upload TTL)
- https://blog.google/innovation-and-ai/technology/developers-tools/interactions-api-general-availability/ — Google Blog, Interactions API GA announcement
- https://github.com/google-gemini/gemini-skills/blob/main/skills/gemini-interactions-api/SKILL.md — Google's own reference skill for the Interactions API (canonical code patterns)
- https://github.com/googleapis/python-genai (releases/tag/v2.10.0, v2.9.0) — SDK changelog confirming when video/interactions surface landed
- Secondary/credible: https://venturebeat.com/technology/googles-gemini-omni-flash-hits-the-api-turning-enterprise-video-production-into-a-conversation (VentureBeat), https://wavespeed.ai/blog/posts/omni-flash-api-availability/ (Vertex AI timing)

---

## 1. The Interactions API

### What it is
The Interactions API (`https://generativelanguage.googleapis.com/v1beta/interactions`) is Google's new unified, **stateful** interface for Gemini models and agents, positioned as the successor/primary recommended interface over the legacy `generateContent` API. General availability was announced June 2026 (public beta since December 2025). It's built for multi-turn tasks, long-running/background work, and agentic tool use — not just chat.

Core resource: an **`Interaction`** — "a complete turn in a conversation or task," containing a chronological `steps` array (model thoughts, tool calls/results, final output).

### Endpoints (REST, Gemini API / AI Studio path)
```
POST   https://generativelanguage.googleapis.com/v1beta/interactions
GET    https://generativelanguage.googleapis.com/v1beta/interactions/{id}
POST   https://generativelanguage.googleapis.com/v1beta/interactions/{id}/cancel
DELETE https://generativelanguage.googleapis.com/v1beta/interactions/{id}
```
Auth: `x-goog-api-key: $GEMINI_API_KEY` header (AI Studio key). See §5 for Vertex AI status.

### SDK surface
- Python: `google-genai >= 2.3.0` (interactions implementation itself was "completely replaced" — public API surface unchanged — in `v2.9.0`, 2026-06-19; video generation + response-format params added in `v2.10.0`, 2026-06-24)
- JS/TS: `@google/genai >= 2.3.0`
- Call shape: `client.interactions.create(...)` (Python) / `client.interactions.create({...})` (JS)

### Request fields (`CreateInteraction`)
| Field | Type | Notes |
|---|---|---|
| `model` | string | Model ID. Required unless `agent` given. |
| `agent` | AgentOption | Agent ID for autonomous/agentic tasks (e.g. Deep Research, Antigravity). Required unless `model` given. |
| `input` | string \| Content[] | Text, or array of typed content parts (`text`, `image`, `audio`, `document`, `video`). |
| `system_instruction` | string | Interaction-scoped — must be resent every call, NOT inherited via `previous_interaction_id`. |
| `tools` | Tool[] | Interaction-scoped — resend every call. |
| `generation_config` | object | Interaction-scoped (temperature, thinking_level, video_config, etc.) — resend every call. |
| `stream` | boolean | Server-sent events. |
| `store` | boolean | Default `true`. `false` disables storage AND is incompatible with `background=true` and with later use of `previous_interaction_id` referencing this interaction. |
| `background` | boolean | Run async server-side; poll via GET or use `webhook_config`. |
| `previous_interaction_id` | string | **The field that chains turns.** "The ID of the previous interaction, if any." |
| `cached_content` | string | `projects/{project}/locations/{location}/cachedContents/{cachedContent}` (Vertex-style resource name — explicit caching is otherwise listed as unsupported on the Gemini API path; implicit caching works automatically via `previous_interaction_id`). |
| `response_modalities` | enum[] | `TEXT`, `IMAGE`, `AUDIO`, `VIDEO`, `DOCUMENT`. |
| `service_tier` | enum | `flex` (50% cheaper), `standard`, `priority`. |
| `webhook_config` | object | Webhook URI(s) for background-completion notification. |

### Response fields (`Interaction` resource)
| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique ID, e.g. `v1_...`. **This is what you pass back as `previous_interaction_id`.** |
| `model` / `agent` | — | Echoed. |
| `status` | enum | `in_progress`, `requires_action`, `completed`, `failed`, `cancelled`, `incomplete` (hit max_tokens etc.), `budget_exceeded`. |
| `created` / `updated` | ISO 8601 | Timestamps. |
| `steps` | Step[] | Typed: `user_input`, `model_output`, `thought`, `function_call`, `function_result`, `google_search_call`, `code_execution_call`, etc. Content parts inside a step: `text`, `image`, `audio`, `document`, `video`. |
| `usage` | object | `total_input_tokens`, `total_output_tokens`, `total_cached_tokens`, `total_thought_tokens`, `total_tool_use_tokens`, `total_tokens`, plus per-modality breakdowns. |
| `environment_id` | string | Only set if an agent environment (sandbox) is provisioned. |
| `response_modalities` | enum[] | Echoed. |
| `previous_interaction_id` | string | Echoed back — confirms the chain link server-side. |

Convenience accessors on the SDK object: `interaction.output_text`, `interaction.output_image`, `interaction.output_audio`, and (for Omni) `interaction.output_video` (base64 `data` + `mime_type`, or a `uri` when `delivery: "uri"` was requested).

### Server-side state / conversation mechanics
- Every interaction is **stored by default** (`store=true`).
- Retention: **paid tier 55 days**, **free tier 1 day**. After that, `previous_interaction_id` referencing an expired interaction will presumably fail (not explicitly documented — treat as "assume gone after retention window", see Integration Implications).
- `previous_interaction_id` carries forward **conversation history (inputs + outputs)**, including — for Omni — the **generated video itself**, without you re-uploading it.
- `tools`, `system_instruction`, `generation_config` are NOT carried forward — they are interaction-scoped and must be resent each call if still wanted.
- `store=false` explicitly disables: (a) `background=true`, (b) being referenced later via `previous_interaction_id`.
- No documented maximum chain depth was found in any official source searched (see Integration Implications — treat as unbounded but practically self-limit).

### Minimal verbatim examples

Basic single-turn (Python, from Google's own `gemini-interactions-api` SKILL.md):
```python
from google import genai
client = genai.Client()
interaction = client.interactions.create(
    model="gemini-3.5-flash",
    input="Tell me a short joke about programming."
)
print(interaction.output_text)
```

Multi-turn via `previous_interaction_id` (Python, verbatim from SKILL.md):
```python
interaction1 = client.interactions.create(
    model="gemini-3.5-flash",
    input="Hi, my name is Phil."
)
interaction2 = client.interactions.create(
    model="gemini-3.5-flash",
    input="What is my name?",
    previous_interaction_id=interaction1.id
)
print(interaction2.output_text)
```
Same in JS (verbatim):
```javascript
const interaction1 = await client.interactions.create({
    model: "gemini-3.5-flash",
    input: "Hi, my name is Phil.",
});
const interaction2 = await client.interactions.create({
    model: "gemini-3.5-flash",
    input: "What is my name?",
    previous_interaction_id: interaction1.id,
});
console.log(interaction2.output_text);
```

### Streaming
`stream=True/true` returns server-sent events. Event sequence:
`interaction.created` → (`step.start` → `step.delta`(s) → `step.stop`)+ → `interaction.completed`.
```python
for event in client.interactions.create(
    model="gemini-3.5-flash",
    input="Explain quantum entanglement in simple terms.",
    stream=True,
):
    if event.event_type == "step.delta":
        if event.delta.type == "text":
            print(event.delta.text, end="", flush=True)
```
Retrieving an in-flight/background stream: `GET .../interactions/{id}?stream=true`, optionally with `last_event_id` to resume.

### Background / async
`background=true` runs the interaction async server-side. Poll with `GET /v1beta/interactions/{id}` (check `status`), or register `webhook_config` to get a push notification on completion. This is the documented pattern for Deep Research and Antigravity agents (which *require* `background=true`), and is explicitly relevant to Omni's own polling flow for URI-delivered video (see §2).

---

## 2. Omni video generation specifics

### Model
- Model ID: **`gemini-omni-flash-preview`**
- Status: **Preview**, not GA, as of 2026-07-02. Only reachable via Interactions API (not the legacy `generateContent` endpoint).
- Context window: 1,048,576 tokens (inherited from Gemini Flash family card).
- Positioned by Google as "the recommended default" video model over Veo 3.1 for most use cases; Veo 3.1 remains separately available for native-audio video, frame-specific direction, and video extension — capabilities Omni currently lacks (see Limitations below).

### Supported inputs
- **Text**: direct prompt.
- **Images**: reference images for styling/composition/subject; multiple reference images supported (e.g. combine a cat photo + a yarn photo).
- **Video**: upload via Files API (`client.files.upload(...)`), then reference by `document`-typed content part with the file's `uri`, for **editing** an existing video. Only **one** video reference at a time — "Referencing or reasoning across multiple videos is not supported." Video references **up to 3 seconds are accepted by the request schema but "not correctly processed by the model at this time"** — effectively broken/unreliable for now.
- **Audio**: accepted as an input modality per the model description ("processes text, image, audio, and video simultaneously") but audio *references* for video editing are explicitly unsupported ("Voice editing is not supported").
- Not supported: YouTube URLs as video input, multi-video reasoning.

### Output
- Format: MP4, delivered either **inline base64** (default, works for outputs < 4MB) or via **`delivery: "uri"`** (Files API URI + polling, recommended for anything > 4MB / above 720p when available).
- Aspect ratio: `"16:9"` (landscape, default) or `"9:16"` (portrait) via `response_format.aspect_ratio`.
- Resolution/duration/fps per the model card: **720p, 24fps, 3–10 second clips** (not restated on the `/docs/omni` page itself — treat model-card figures as the concrete spec, `/docs/omni` only says timing "varies based on duration, resolution, and current API load").
- All generated videos carry **SynthID watermarking**.
- Unsupported generation_config knobs on Omni: `system_instruction`, `temperature`, `top_p`, `stop_sequences`, negative prompts, provisioned throughput.

### Editing operations supported
- Conversational/iterative edits via `previous_interaction_id` on a prior Omni interaction: element replacement/removal ("Make the violin invisible"), lighting changes, background swap, style transforms ("make this video anime" / 8-bit / watercolor), perspective changes.
- Editing an **uploaded** video (not previously Omni-generated) via Files API `document` reference + text instruction.
- `generation_config.video_config.task` field distinguishes generation modes, e.g. `"image_to_video"` (seen in the REST example below) — implies a `"text_to_video"` counterpart, and presumably an edit/`previous_interaction_id` path doesn't need `task` set explicitly.

### Editing operations explicitly NOT supported (verbatim constraints list)
- "Editing uploaded videos is not currently available for users in the European Economic Area (EEA), Switzerland, and the United Kingdom."
- "Uploading and editing images containing minors is not supported in European Economic Area[, Switzerland, and the United Kingdom]."
- "Video extension and video interpolation are not supported."
- "Voice editing is not supported."
- "Referencing or reasoning across multiple videos is not supported."
- Video references up to 3s accepted by schema but not correctly processed (functionally unsupported today).

### Best practices (verbatim from docs)
- "Use URI delivery for large videos: For videos larger than 4MB (>720p when available)."
- "Optimized performance: Set `background=false`, `store=false`, and `stream=false`" — **NOTE**: this directly conflicts with wanting to chain edits via `previous_interaction_id`, which requires `store=true` (the default). Only use `store=false` for one-shot, non-chained generations.
- "Simple prompts work best for video editing. Overly descriptive prompts can lead to unintended changes."
- English is fully supported; other languages "have not been evaluated."

### Verbatim code examples

Text-to-video (Python):
```python
import base64
from google import genai

client = genai.Client()

interaction = client.interactions.create(
    model="gemini-omni-flash-preview",
    input="A marble rolling fast on a chain reaction style track, continuous smooth shot."
)
with open("marble.mp4", "wb") as f:
    f.write(base64.b64decode(interaction.output_video.data))
```

Aspect ratio control (JavaScript):
```javascript
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
const ai = new GoogleGenAI({});

const interaction = await ai.interactions.create({
  model: 'gemini-omni-flash-preview',
  input: 'A futuristic city with neon lights and flying cars, cyberpunk style',
  response_format: {
    type: 'video',
    aspect_ratio: '9:16'
  },
});

if (interaction.output_video?.data) {
  fs.writeFileSync('example.mp4', Buffer.from(interaction.output_video.data, 'base64'));
}
```

**Stateful editing — the exact pattern we need (Python):**
```python
import base64
from google import genai

client = genai.Client()

# Turn 1: Generate initial video
res1 = client.interactions.create(model="gemini-omni-flash-preview", input="A woman playing violin outdoors.")

# Turn 2: Edit the previous video
res2 = client.interactions.create(
    model="gemini-omni-flash-preview",
    previous_interaction_id=res1.id,
    input="Make the violin invisible."
)
with open("example.mp4", "wb") as f:
    f.write(base64.b64decode(res2.output_video.data))
```
Same in JS (verbatim from `/docs/omni`):
```javascript
const res2 = await ai.interactions.create({
  model: 'gemini-omni-flash-preview',
  previous_interaction_id: res1.id,
  input: 'Make the violin invisible.'
});
```

Editing an uploaded (not Omni-generated) video via Files API (Python, verbatim):
```python
import time
import base64
from google import genai

client = genai.Client()

# Upload video using the file API
video_file = client.files.upload(file="Video.mp4")

while video_file.state == "PROCESSING":
    print('Waiting for video to be processed.')
    time.sleep(10)
    video_file = client.files.get(name=video_file.name)

if video_file.state == "FAILED":
  raise ValueError(video_file.state)
print(f'Video processing complete: ' + video_file.uri)

# Edit your video
interaction = client.interactions.create(
    model="gemini-omni-flash-preview",
    input=[
        {"type": "document", "uri": video_file.uri},
        {"type": "text", "text": "When the person touches the mirror, make the mirror ripple beautifully like liquid, and the person's arm turns into reflective mirror material"}
    ],
)
with open("example.mp4", "wb") as f:
    f.write(base64.b64decode(interaction.output_video.data))
```
Note: this uses `{"type": "document", "uri": ...}` for a video *file*, not `{"type": "video", ...}` — the content-part `type` for an uploaded video reference is `document`, not `video`. (`video` as a content-part `type` shows up in the *output* `steps[].content[]` shape, e.g. `{"type": "video", "mime_type": "video/mp4", "data": "..."}`.)

URI delivery + polling for large output (Python, verbatim):
```python
import time
from google import genai

client = genai.Client()

# 1. Request video via URI delivery
interaction = client.interactions.create(
    model="gemini-omni-flash-preview",
    input="A beautiful sunset.",
    response_format={"type": "video", "delivery": "uri"}
)

# 2. Extract file name and poll for ACTIVE state
video_output = interaction.output_video
file_name = video_output.uri.split("/")[-1] # Extract ID

print("Waiting for video processing...")
while True:
    f_info = client.files.get(name=f"files/{file_name}")
    if f_info.state.name == "ACTIVE":
        break
    elif f_info.state.name == "FAILED":
        raise RuntimeError("Generation failed.")
    time.sleep(5)

# 3. Download the final video
video_bytes = client.files.download(file=video_output.uri)
with open("output.mp4", "wb") as f:
    f.write(video_bytes)
```

Image-to-video with explicit `task`, raw REST/curl (verbatim):
```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/interactions" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "gemini-omni-flash-preview",
        "input": [
          {
            "type": "image",
            "data": "'"$BASE64_IMAGE"'",
            "mime_type": "image/jpeg"
          },
          {
            "type": "text",
            "text": "turn this into realistic footage, using the drawing only as a guide for movement, do not show the drawing in the final video"
          }
        ],
        "generation_config": {
          "video_config": {
            "task": "image_to_video"
          }
        }
      }'
```

Inline-delivery response shape (from docs, reconstructed field-accurate):
```json
{
  "id": "v1_...",
  "steps": [
    {
      "type": "model_output",
      "content": [
        { "type": "video", "mime_type": "video/mp4", "data": "AAAAIGZ0eXA..." }
      ]
    }
  ]
}
```

### Pricing (from `ai.google.dev/gemini-api/docs/pricing`, verbatim figures)
- Input: **$1.50** per 1M tokens (applies uniformly across text/image/video/audio input).
- Output: **$9.00** per 1M tokens for text output, **$17.50** per 1M tokens for video output.
- Billing basis: **"total output token consumption, calculated at a rate of 5,792 tokens per second of 720p video."** Under Standard tier pricing this is **"approximately $0.10 per second"** of generated video.
- `service_tier: "flex"` gets a **50% cost reduction** vs standard (per the GA blog post), at presumably lower priority/availability guarantees. `priority` tier exists as the other end of that spectrum. No Omni-specific flex/priority numbers were published separately from the above per-token rates.
- No separate pricing line item was found for Interactions API storage, background execution, or `previous_interaction_id` chaining itself — chaining an edit just re-runs the model on the new turn, i.e. you're billed again as a normal generation (input tokens include the "conversation history" the server injects, output tokens include the new video). Exact input-token cost of the injected prior-video context is not documented — treat as unknown/to-be-measured.

---

## 3. Conversational editing flow — concrete chaining mechanics

**How to chain "generate video" → "modify that video":**
1. Call `client.interactions.create(model="gemini-omni-flash-preview", input="<prompt>")` with `store` left at default (`true`) — do NOT set `store=false` if you intend to edit later.
2. Capture the response's `id` field (e.g. `res1.id` / `interaction.id`).
3. For the edit, call `client.interactions.create(model="gemini-omni-flash-preview", previous_interaction_id=res1.id, input="<edit instruction>")`. No video bytes or URIs need to be resent — the server resolves the prior video from stored interaction state.
4. The edit's response is itself a full `Interaction` with its own `id` — to chain a *second* edit, pass `previous_interaction_id=res2.id` (i.e. always point at the most recent interaction in the chain, not the original). This makes it a linear chain, not a fixed reference to turn 1 — each edit's base is "whatever the previous turn produced," matching the "iteratively refine" framing.
5. Alternatively, you can **branch**: reuse `res1.id` (or any earlier id in a chain) as `previous_interaction_id` for a different edit to fork two variants from the same base. VentureBeat's writeup explicitly describes this branch-and-store pattern (turn a cat into a puma kitten, then separately restyle into 8-bit vs. watercolor from the same base, storing each version to branch from later).

**What ID is passed where:** only one ID field is involved — `previous_interaction_id` in the request, matched against `id` in a prior response. There is no separate "video ID" or "generation ID" distinct from the interaction ID for Omni — the interaction *is* the unit that carries the video state forward.

**TTL/expiry:**
- Interaction state (and thus the ability to use it via `previous_interaction_id`): **55 days (paid tier) / 1 day (free tier)** — this is the Interactions API-wide retention policy (`interactions-overview` doc), not Omni-specific; no separate/shorter TTL was documented for video-bearing interactions specifically.
- Uploaded/output video **files** (Files API, `client.files.upload` / URI-delivered outputs): standard Gemini Files API TTL is **48 hours**, auto-purged after that; no custom shorter/longer TTL is configurable today (open GitHub feature request `googleapis/python-genai#1172` asking for configurable TTL, unresolved as of research date). Longer-lived storage requires re-hosting in GCS or passing a publicly accessible / presigned URL instead of using Files API upload.
- Practical implication: the **interaction chain** (55 days) can long outlive the **underlying file** (48 hours) if you used `delivery: "uri"` output and didn't download it — but since inline (`base64`) delivery embeds the video bytes directly in the stored interaction step, chained edits off an inline-delivered interaction don't appear to depend on the 48h file TTL at all (server holds the state itself). This distinction is not explicitly confirmed in docs — flag as an assumption to verify empirically (see Integration Implications).

**Chain depth limits:** No documented maximum was found in any official or credible secondary source searched (docs, API reference, SKILL.md, blog, VentureBeat). Treat as effectively unbounded by the API but self-limit in the gateway (see Integration Implications) since cost and error-propagation risk compound with depth, and nothing guarantees quality doesn't degrade after many edits.

---

## 4. Other notable Omni/Interactions capabilities

- **Multi-input reasoning**: Omni ingests text + image + audio + video simultaneously in one request (native multimodal input, not just text).
- **Character/world consistency**: Google markets "character consistency" and "world knowledge" (physics understanding + factual/cultural knowledge) as differentiators — no separate API knob for this; it's a model behavior, not a parameter.
- **Image generation via Interactions API**: same `client.interactions.create()` surface handles image generation too (Nano Banana 2 family) — `response_modalities: ["IMAGE"]` — relevant if we want a single gateway code path for both image and video Omni-family calls.
- **Audio/music via Interactions API**: Lyria 3 (music) and "expressive speech" are also reachable through the same Interactions API per the GA blog post — not deeply documented in the pages fetched, but confirms Interactions is meant as the one surface for all generative modalities going forward.
- **Streaming progress**: `stream=true` gives step-level SSE progress (`step.start`/`step.delta`/`step.stop`) — for video generation this is likely coarse (no evidence of frame-level progress events; video output arrives as a `model_output` step, so streaming probably just tells you *when* generation starts/finishes rather than incremental frames).
- **Webhooks**: `webhook_config` on `background=true` requests — push notification instead of polling. No documented payload schema was found in the fetched pages; would need the full API reference's webhook section (only endpoint list + top-level fields were captured — worth a follow-up fetch of `ai.google.dev/api/interactions-api` webhook subsection before implementing).
- **Agents share the same endpoint**: `agent` field is polymorphic with `model` — e.g. Deep Research (`deep-research-pro-preview-12-2025`, `deep-research-max-preview-04-2026`) and Antigravity (`antigravity-preview-05-2026`) agents run through `/v1beta/interactions` too, always with `background=true` and sometimes `environment="remote"` for a sandboxed environment. Not directly relevant to video, but confirms the whole product surface (agents + generation) is consolidating onto Interactions.

---

## 5. Gemini API (AI Studio, API key) vs Vertex AI

- **Gemini API (AI Studio) — API key auth via `x-goog-api-key`, endpoint `generativelanguage.googleapis.com/v1beta/interactions`**: this is the ONLY path documented for Omni + Interactions API today. All code examples above use this path.
- **Vertex AI**: As of the research date (2026-07-02), **`gemini-omni-flash-preview` is NOT available on Vertex AI.** A dedicated Vertex AI model-card URL for "omni-flash" returns 404. Secondary reporting (WaveSpeed blog, referencing a Google statement from around May 2026) says Vertex AI access is coming "in the coming weeks" with no committed date, and draws an analogy to past Gemini feature rollout timing (AI Studio preview → Vertex GA typically 1–3 months later, "a pattern, not a promise"). Omni is currently also live as a consumer feature inside the Gemini app (US, AI Plus/Pro/Ultra tiers) — that's a separate, non-API surface.
- **Practical consequence for us**: our gateway must use the **AI Studio API-key path** for Omni today; there is no Vertex/service-account/IAM equivalent yet. If/when Vertex support lands, expect a `projects/{project}/locations/{location}/...` style resource path (matching how `cached_content` is already shaped in the Interactions API reference) and standard Vertex IAM/service-account auth — but this is speculative, not confirmed.
- The Interactions API itself (non-Omni parts — text models like `gemini-3.5-flash`, agents) may have broader Vertex support already; that wasn't the focus of this research and should be re-checked separately if we want to unify auth paths.

---

## Integration implications

For our self-hosted node gateway (`native-media-gateway/`), currently doing one-shot Omni video generation, moving to iterative edit-by-reference:

1. **Use `x-goog-api-key` (AI Studio) auth, not Vertex** — Omni has no Vertex path yet. Don't build a dual-auth abstraction for Omni specifically until Vertex support actually ships; keep the Vertex code path (if any exists elsewhere in the gateway) separate from Omni.
2. **Switch the call from whatever `generateContent`-style call we use today to `client.interactions.create(...)`** (or raw POST to `/v1beta/interactions`) — Omni is only reachable through the Interactions API, not the legacy endpoint.
3. **Persist `interaction.id` per generated video**, not just the video file/URL. This is the field to store in our DB/job record — call it e.g. `omniInteractionId` — because it's the only handle that lets a later "edit this" request skip re-upload.
4. **Never set `store=false` on a generation we might want to edit later.** Default `store` is `true`, which is what we want — but audit any "optimize latency" code path (the docs' own perf tip suggests `store=false`/`background=false`/`stream=false`) to make sure we don't disable storage on generations users might chain from.
5. **On "edit that video" requests, send `previous_interaction_id=<last interaction id in the chain>`, not the original turn's id**, unless we intentionally want branch-from-original semantics. Decide product behavior: linear-refine (always point at latest) vs. branch (let user pick any prior turn as the edit base) — the API supports both; we choose which UX to expose.
6. **Track chain depth ourselves and cap it** (e.g. 10–20 edits) — the API doesn't document a limit, so unbounded chains are a cost/quality risk we should self-govern rather than discover empirically in production.
7. **Model TTL mismatch explicitly**: interaction state lives 55 days (paid)/1 day (free); Files API-uploaded/URI-delivered video artifacts expire in 48h unless re-hosted to GCS or downloaded by us. If we use `delivery: "uri"` for large outputs, download and store the MP4 in our own storage immediately — don't rely on Google's URI staying valid, and don't assume a stale `previous_interaction_id` chain still has a resolvable video after 48h even if the interaction record itself is still within its 55-day retention (unconfirmed edge case — test this: generate, wait >48h without downloading, then try an edit via `previous_interaction_id` and see if it still works when original delivery was `uri` vs inline `base64`).
8. **Use inline `base64` delivery by default for the "keep editable" path**, and only switch to `delivery: "uri"` + polling when output would exceed ~4MB (Google's own stated threshold), since inline-embedded video state may be more directly tied to the interaction record's own retention (55 days) rather than the shorter 48h Files API TTL — reduces edge-case risk from point 7, pending confirmation.
9. **Error/status handling**: our gateway should branch on `status` — `completed` (success, extract `output_video`), `failed` (surface error, don't retry blindly), `in_progress`/`requires_action` (only relevant if we use `background=true`; poll or use `webhook_config`), `incomplete`/`budget_exceeded` (partial/limit-hit — treat distinctly from `failed` in UI messaging, e.g. "generation was cut off" vs. "generation failed").
10. **Region/content restrictions are user-facing, not just API errors**: EEA/UK/Switzerland users cannot edit uploaded videos, and cannot upload/edit images/videos containing minors anywhere in EEA — surface this as a pre-flight capability check (by user region) rather than letting it fail server-side, since it's a policy block not a transient error.
11. **Video-as-input (not edit-of-prior-generation) still requires Files API upload** (`client.files.upload`) using content-part `{"type": "document", "uri": ...}` — NOT `{"type": "video", ...}` for the input side (that shape is only seen in output steps). Note current input video quality caveat: refs ≤3s are schema-accepted but not reliably processed — don't build a "upload a short clip to seed a video" feature on this yet; it's effectively non-functional per docs.
12. **`generation_config.video_config.task`**: set explicitly to `"image_to_video"` when seeding from a reference image; presumably omit (defaults to `"text_to_video"`) for pure text prompts, and omit for `previous_interaction_id` edits (task is inferred from context). Confirm the exact enum values (only `"image_to_video"` was seen verbatim in docs) against the SDK's type definitions before wiring this up — check `google-genai`'s `types.py` for the full `VideoConfig.task` enum.
13. **Pricing model to surface/track internally**: video output billed at ~5,792 tokens/sec of 720p video ≈ $0.10/sec on standard tier ($17.50 per 1M output tokens). An edit call is a fresh generation, billed again — budget/cost-limit logic in our gateway should treat each chained edit as a full-cost operation, not a cheap delta, unless empirical testing shows otherwise (undocumented how much the "carried forward" prior-video context adds to input token cost — worth logging `usage.total_input_tokens` per call to build our own cost model rather than trusting an unstated estimate).
14. **`service_tier: "flex"`** (50% cheaper) is worth exposing as a gateway-level cost/latency tradeoff option if our video jobs tolerate lower priority — no Omni-specific caveats found, but verify flex tier is actually accepted for Omni specifically (not just text models) before relying on it.
15. **SDK version pin**: require `google-genai >= 2.10.0` (2026-06-24) for the video-generation + response-format parameters to exist at all in the Python SDK; `2.9.0`'s interactions rewrite claims no public API changes but given how new this is, pin exactly and add a smoke test rather than trusting semver.
