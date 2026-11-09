---
name: Vite on Replit
description: Replit support directories can make Vite dependency scanning exceed the available file handles.
---

For this project, keep Vite dependency auto-discovery disabled with an empty
`optimizeDeps.include`, and exclude `.cache`, `.local`, and `.agents` from the
development file watcher.

**Why:** Vite's cold-start dependency scan traversed Replit's managed support
directories and failed with `EMFILE` before the preview could serve requests.

**How to apply:** If changing dependency optimization or file watching, confirm
the dev workflow still starts on port 5000 and the browser preview responds.
