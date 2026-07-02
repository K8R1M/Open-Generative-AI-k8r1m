# Gate A -- Karem's Feedback From Testing

Captured verbatim from Karim's Gate A manual testing report.

```text
So first i Successfully generated an image with Nano banana 2 And multiple references.
1.  when i wrote a name in the name field in the prompt box - it did name the file and the name showed on the card in the interface - and also when i downloaded it, it had the correct name.
HOWEVER:
A. the name disappeared after i generated the image so it wouldnt be used as-001 and -002 for Subsequent generations, as it's supposed to be. Until I either remove the name or make another name there.
B. whe i tried to rename this or ANY of them the Pop up came, I typed in the new name and then it said "failed to rename generation"
C. When I initially opened the app, only the last two images generated actually had names in them. image-studio-0001 and image-studio-0002 Those ones also get downloaded with the correct names. All the other images from before still have their opld name (which is ok) but NOTHING is written on the cards (maybe coz they dont fit) how / why did we reneame only 2 of the previous gens?

2. When I clicked to add the image to the video studio prompt it did turn up there.

3. i tried generating the vid with imagine 1.5 native it gave the following error:
Console Error

Native generation failed: 400 Bad Request {"error":"BAD_REQUEST","message":"Invalid native media request."}

packages/studio/src/nativeMedia.js (483:13) @ generateNativeMedia

  481 |     if (!res.ok) {
  482 |       const detail = await res.text().catch(() => '');
> 483 |       throw new Error(`Native generation failed: ${res.status} ${res.statusText} ${detail.slice(0, 120)}`);
      |             ^
  484 |     }
  485 |     const data = await res.json().catch(() => ({}));
  486 |     const job = { id: data.request_id || data.id || req.clientRequestId, modelId: req.modelId };

Call Stack 1
generateNativeMedia
packages/studio/src/nativeMedia.js (483:13)


4. I swapped to google omni - the ref image stayed as is should then i sucessfully generated a video with the native omni

5. then i succesfully got the last frame with the button and used it as the first frame for the next generation :)

6. however again the name diappeard so the next generation didnt get a name

7. i tried uploading the video we just made to gemini omni it got to 100% then said Video upload failed: File upload failed: 403 - Not authorized: missing or invalid credentials

8. renaming alsoi failed on the video cards

9. I did a hard reset of the app on the front end, and the names were still there. For the ones that have names.

10. them i tested image gen with the native codex and multiple ref images - it worked

11. then i sent an image to the image studio prompt as reference from the button on the card - that worked.

12. i generated another image from that reference with nano bananaa pro - that worked

13. then i sent both images i just made to the video studio with the button - that worked
BUT when i change model from omni to veo 3.1 fast only 1 of the 2 images remained in the box - so i went back to  add them  again from the image studio but when i added the image the model in the video studio changed back to omni!
i even then set the model to veo then swithched back and forth between tabs - and the model in video studio stayd the veo 3.1 fast native - but then when i click on add image from the image studio to the video prompt it change the model to omni again!

14. then i tested a veo 3.1 fast generation with that - it also worked i just did it as a test
at some point while changing tabs back and forth all the imagesin the video cards in th UI - the previous video gens) were not there! i mean the crads buttons prompts names etc were there but images didnt load in at one point
And then after that, when this VEO fast generation was successful, I couldn't see that there either as in it succeeded and came up. It made the video and I was able to generate it.  But when I clicked on it in the interface, I couldn't play it and all of the other images for the thumbnails for the videos were not there.
When I clicked on Iage Studio, the thumbnails for the images were still there.
i Did a hard refresh and the images returned in the video section.

deleteing seemed to work fine also after refreshes - please note all this

AND i would liek ti if when i start a generation - if i change tab and things that generation STILL gets fetched and put in the right place when complete - regardless of if i stay on the tab for that studio or not. - so that if i change tab and come back - it is still fetched - and if it is finished BEFORE i return to the tab it is fetched as soon as finished and appeard correctly in that tab when i next click it.


DONT DO ANYTHING JUST NOT all these things in the right p[lace - I am giving the above list to FABLE to look at what you did so far and what i am saying then he can make a plan for you to follow to fix things and move on.

So I want you to make a markdown file with absolutely everything I said here in verbatim, as I've said it as Karem's feedback from testing.  And make sure that all the state files are updated and that you've made a little markdown file of your own explaining the status what you did and stuff to fable.  And then give me a short prompt to paste into a fresh session of fable in this folder where he can quickly update himself with the plan he made before and then check how you've implemented, look at my feedback, go and investigate so that he understands exactly how to fix everything in exactly what to do next in the best possible way, and then he'll write a markdown file with comprehensive instructions, step by step letter for letter that you can follow as an orchestration implement the rest of the things and continue with this plan to the end.  The prompt you give me to copy and paste should be relatively short and the contents of what we need to tell him the information should be in the Markdown files and also your markdown files should not instruct him to go ahead and do things, it should just tell him my intention, get him to summarize for me, he get him to do his research investigation, do a summary for me, make recommendations to me, and then discuss with me after discussion with me, then asking me clarifying questions, removing ambiguity and so forth, then he can go ahead and amend the plan or make a new plan or whatever it is to fix everything to put everything as it stands fixed onto the main branch to then start a new feature branch and then continue the plan with everything else okay.
```
