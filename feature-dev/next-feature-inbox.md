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
- Deleting uploads should warn when the upload is tagged in a Project or Reference. No warning is needed just because the upload was used to generate something.
- Prompt templates should be plain Markdown files in V1.
- Uploads tab should replace the generated images/videos in the center of the screen.
- References sidebar should behave like a cascading menu: References -> Characters/Locations/Props -> named collection -> open that page.

## Current Priority

1. Add Gemini Omni native video provider first.
2. Then continue with the other feature phases.
