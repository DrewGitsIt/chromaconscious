ChromaConscious: Figma variables
================================

Each .json file is one mode, in Figma's DTCG variable format:

  light.json
  dark.json
  light-medium.json
  dark-medium.json
  light-high.json
  dark-high.json

light / dark are the theme at standard contrast; -medium and -high are the
same theme at the contrast slider's other two settings.

Every file defines the same 117 colour variables:
  color/...   45 theme tokens (background, primary, ...; color/scrim has alpha)
  ramp/...    72 ramp steps (ramp/primary/1 ... ramp/primary/12, per ramp)


IMPORT ON A PAID PLAN (Professional, Organization, Enterprise)
--------------------------------------------------------------
1. Open the Local variables panel and create a new collection.
2. Drag all 6 files in at once (or just light.json and dark.json).
   Figma makes one mode per file, named after the file.
3. Switch a frame between modes to swap light, dark and contrast levels.


IMPORT ON THE FREE STARTER PLAN (one mode per collection)
---------------------------------------------------------
Import each file as its own collection:
1. Create a collection named, say, "ChromaConscious light". Drag in light.json.
2. Create another, "ChromaConscious dark". Drag in dark.json.
3. Repeat for any contrast variants you want.
A free collection cannot switch modes, so to move a design from light to dark,
rebind its fills to the same-named variable in the other collection.


NOTES
-----
- Colours are sRGB. Each value carries its hex too, so you can spot-check:
  a variable's hex in Figma should match the hex in the file and in the app.
- Shadows have no Figma variable type. The elevation shadows are in each
  file under $extensions.chromaconscious.shadows; Figma skips them on import.
- Values are plain colours, not aliases between variables.
