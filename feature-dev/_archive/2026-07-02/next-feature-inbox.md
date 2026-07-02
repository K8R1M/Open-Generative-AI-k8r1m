# OGAI Next Feature Inbox

This file records Karim's requested ideas for the next feature-development round. It is not the implementation plan. Before planning or coding, follow `feature-dev/README.md`.

## Must Include

1. Last-frame download button
   - Add the previously requested button for generated videos.
   - It should take the last frame of a generated video using `ffmpeg`/`ffprobe`.
   - It should download that frame so it can be used as the first frame of the next generation.
   - Existing plan: `docs/plans/native-video-last-frame-download-plan.md`.

2. App logo
   - Create/add the OGAI logo.
   - Place it in the top corner of the app.
   - Logo generation requirement:
     - Generate a square `1:1` logo image.
     - Preferred source size: `1024x1024` PNG, ideally transparent background.
     - Keep the mark readable when displayed at `32x32`.
     - Current app header is `56px` tall and currently uses a `32x32` logo container, so implementation should display the logo at `32x32` unless the header is deliberately redesigned.

3. Add generated asset to prompt as an input
   - Add another thumbnail action in the same visual style as copy/delete.
   - Clicking it should add the generated image or video to the prompt inputs as a reference.
   - Add/append to existing prompt inputs; do not replace existing selected inputs.
   - If appending text context, append with a space or new line.
   - For images, support adding to Image Studio as a reference image.
   - For now, generated videos as prompt references should only be allowed for the new Gemini Omni provider being created, not forced into existing providers that do not accept video input.

4. Gemini Omni native video provider
   - Add Gemini Omni as a native video generation provider, similar to the existing native Veo path.
   - It likely uses related Vertex-style scripts/calls, but must be verified before planning.
   - It must handle its actual supported modalities, not assumptions:
     - text to video
     - image to video
     - video to video
     - mixed/multiple accepted input media modalities plus prompt
   - Uploaded accepted media and prompt should be passed correctly.
   - Generated output should return through the same native media/library flow as existing providers.
   - Karim wants Gemini Omni added first before the other new feature phases.

5. Output naming controls
   - Add better user control over generated output filenames.
   - User should be able to set a default prefix such as:
     - `NICO-CHAR-REF-`
     - `WALLVID-SC01-SH02-`
   - App should append version suffixes such as `v001`, `v002`, etc.
   - Continue using the current prefix until the user changes/submits a new prefix.
   - Version counters reset per prefix.
   - If Karim reverts to a previously used prefix, continue from the last version used for that prefix instead of overwriting or restarting at `v001`.
   - Naming field may live top-right, possibly under Settings.
   - Applies to generated images and videos.

6. Collapsible left sidebar library/workspace
   - Add a collapsible sidebar on the left.
   - Clicking a sidebar section opens its contents in the main/right content area where generated images/videos currently display.
   - It should present files from specific folders, or unified views over files located in different folders.

7. Uploads tab
   - Sidebar tab for uploaded server media.
   - Shows uploaded images now and uploaded videos in future if supported.
   - UI should be similar to generated asset gallery.
   - Uploaded items should have useful actions, including:
     - delete
     - add to prompt in Image Studio
     - add to prompt in Video Studio
   - Choosing an add-to-studio action should take the user to that studio with the media loaded as prompt/reference input.
   - Deleting an uploaded asset should warn if it is tagged in a Project or Reference.
   - Deleting an uploaded asset does not need to warn merely because it was used as an input for a generation.

8. Prompt templates tab
   - Sidebar tab for prompt templates.
   - Templates should be stored as Markdown files in one folder.
   - User should be able to:
     - create a new template file in the browser
     - edit/write it in the browser
     - save it with a name
     - browse existing templates
     - copy a template to the clipboard for pasting into the prompt box
   - V1 should be plain Markdown files only; no tags/search/folder hierarchy unless later requested.

9. References tab
   - Sidebar tab for reusable references.
   - Include sections/subtabs:
     - Characters
     - Locations
     - Props
   - User should be able to add uploaded or generated media to references.
   - Asset action should offer "add to references".
   - Modal should let user choose:
     - reference type: character, location, or prop
     - existing collection, or create a new one
   - Example: generating many costumes for one character should allow adding those images to that character's reference collection.
   - Avoid duplicate file copies where possible; store media once and use metadata/tags/collections to show it in the right reference views.
   - Sidebar behavior:
     - Clicking `References` should open like a right-click/cascading menu.
     - Hover/roll over `Characters`, `Locations`, or `Props` to open another menu.
     - That submenu lists each character/location/prop name.
     - Clicking a specific name opens that character/location/prop page in the main content area.

10. Projects tab
    - Sidebar tab for project organization.
    - Projects should organize images and videos.
    - Images can be added to a project as:
      - character
      - location
      - prop
    - Videos can be added to project scenes/shots.
    - Add-to-project action should let user choose:
      - existing project, or create a new project
      - project role/category such as scene, character, location, prop
      - for videos, scene/shot organization
    - Example sidebar shape:
      - Projects
        - Characters
        - Locations
        - Props
        - Video 1
          - Scene 1
          - Scene 2
        - Video 2
          - Scene 1
          - Scene 2

11. Thumbnail action layout
    - Current top-right first action: expand.
    - Second action: download.
    - Third action: copy prompt.
    - Add action: use this image as next Image Studio reference.
    - Add action: send/use this asset as Video Studio reference.
    - Add action/menu: plus button for adding to References or Projects.
    - Delete can move to bottom/last position, possibly bottom-left, if too many icons crowd the right side.
    - All icons should look good and match the app's current dark interface, fonts, and modal style.

## Clarify Before Planning

- Exact Gemini Omni model/API name and current official docs.
- Whether Gemini Omni is available through current Vertex credentials/project.
- Which uploaded media types should be accepted in V1: image only, video too, audio too, or only whatever Gemini Omni supports.
- Whether output filename prefixes are global, per studio, per project, or per provider.
- Whether references/projects should use tags/metadata only, or create lightweight collection records pointing at the original asset.
- Whether clicking a sidebar tab always replaces the generated history view, or only for content pages such as Uploads and selected Reference/Project pages.

## Answered Clarifications

- Logo should be generated with image generation and then used in the app. Required source: square `1:1`, preferred `1024x1024` transparent PNG, designed to remain legible at `32x32` in the current `56px` app header.
- Add-to-prompt should append to existing prompt/inputs, separated by a space or new line, not replace existing inputs.
- Generated videos should only be addable as prompt references for the new Gemini Omni provider in this next phase.
- Filename version counters reset per prefix, but reverting to an old prefix should continue from the last used version for that prefix.
- Filename prefixes should be separate per studio, not per provider. Image Studio shares one image naming prefix/counter across image providers; Video Studio shares one video naming prefix/counter across video providers.
- Deleting uploads should warn when the upload is tagged in a Project or Reference. No warning is needed just because the upload was used to generate something.
- Prompt templates should be plain Markdown files in V1.
- Uploads tab should replace the generated images/videos in the center of the screen.
- References sidebar should behave like a cascading menu: References -> Characters/Locations/Props -> named collection -> open that page.
- Current Gemini Omni tests are still running and should not be inspected until Karim says they are finished. Test outputs will live under `/home/k8r1m/merlin/Projects/omni tests/` across multiple subfolders, not only `raizan-box-ref/`.
- Gemini Omni learnings, reusable best practices, and scripts should be recorded so future runs can call the scripts directly, matching the existing Vertex/Nano Banana/Veo pattern after it is traced.
- First feature branch/folder can be `feature-dev/omni-v1/`.
- First branch scope is Gemini Omni V1 plus minimal UI/input changes it actually needs, then selected low-complexity adjacent buttons only.
- First branch button priority after Omni: multi-select generated assets for batch deletion only, last-frame download for generated videos, then use generated images as references in Image Studio or Video Studio.
- First branch should not include projects, references, characters, collection pages, bulk add-to-project/reference, uploaded-media warnings, sidebar/library redesign, prompt templates, or generated video references.
- Batch delete is included in Omni V1.
- Generated image actions should add the image as a reference/input to both Image Studio and Video Studio in this pass.
- Last-frame V1 should run deterministic server extraction from a video card and auto-download the resulting frame to the laptop. Do not auto-import that frame into Uploads or prompt inputs until the later Uploads/sidebar phase.
- Output naming V1 may leave server asset filenames unchanged, but must persist the user-assigned download/display name as metadata so future library, Reference, Project, and download views can show/use that assigned name.
- Existing working Omni script surface: `/home/k8r1m/merlin/bin/genai-omni`, documented by `/home/k8r1m/.codex/skills/generate-media/sub-skills/generate-omni/SKILL.md`.

## Current Status / Priority For Fable

Done enough to treat as implemented:

1. Gemini Omni native video provider.
2. Multi-select generated image/video batch delete.
3. Last-frame download for generated videos.
4. Generated-image-to-Image-Studio reference action.
5. Automatic per-studio display/download naming metadata.

Still unresolved:

1. Generated-image-to-Video-Studio reference action still fails in Karim's live `19400` test.
2. Visible naming/prefix input was not implemented; current naming is automatic metadata only.
3. Editable rename UI was not implemented.

Next planning priority:

1. Decide whether to fix the broken Video Studio handoff in the current feature branch, disable/remove that broken action before merge, or split working features into a clean merge branch.
2. Do not merge the current feature branch to `main` just for planning. Fable can inspect both worktrees:
   - `/home/k8r1m/Open-Generative-AI-main-19300`
   - `/home/k8r1m/Open-Generative-AI`
3. Defer project/reference/sidebar/template phases until the current branch is either fixed and merged or deliberately narrowed.
