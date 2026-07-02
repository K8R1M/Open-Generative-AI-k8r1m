# Recommended Open-Generative-AI Product Model

## Product name suggestion

Use a neutral internal name such as **Project Storyboard** or **Storyboard Projects** rather than copying Higgsfield naming.

## Core object model

- Project
- Scene
- Shot
- ReferenceCollection
- ReferenceAsset
- CharacterBible
- Location
- Prop
- PromptTemplate
- Variant
- GenerationJobLink

## V1 mental model

A Project is a metadata wrapper around existing native media. It does not own or copy media. It stores the narrative structure, references, prompts, and job links needed to plan and iterate an AI video.

## Reference types

- Character: identity/appearance/wardrobe/personality notes and curated assets.
- Location: environment continuity, lighting direction, spatial notes, assets.
- Prop: object appearance, scale/material/color notes, assets.
- Style: visual references and style bible fragments.
- Frame: first/last-frame continuity references.

## Prompt composition

A prompt can include `@tags`. At generation time:

1. Find matching ReferenceCollection in project scope.
2. Insert the collection prompt snippet into the prompt text.
3. Attach selected ReferenceAsset media inputs if the target model supports them.
4. Record resolved prompt and reference snapshot on Variant.

## Capability-based generation

Do not assume every model supports all reference types.

Use capability flags:

- `supportsImageReferences`
- `supportsMultipleReferences`
- `maxReferenceImages`
- `supportsFirstFrame`
- `supportsLastFrame`
- `supportsStartEndFrame`
- `supportsVideoInput`
- `supportsCameraFields`

For unsupported capabilities, degrade with visible warning and text-only prompt snippets.
