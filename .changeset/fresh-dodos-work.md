---
"@sanity-labs/workflow-kit": minor
---

Add declared and tested support for Sanity Studio 6.9.2 and later 6.x releases. Workflow UI now uses the official UI 4 tooltip and toast entrypoints, and CI builds packed consumers at the Studio 6.9.2/UI 4.0.1 minimum and against the current Studio 6 release.

**Breaking:** Sanity `^6.9.2` and `@sanity/ui@^4.0.1` are now required. Sanity 5 consumers should remain on `workflow-kit@^0.5.1`. Sanity 6.0–6.9.1 is not formally supported; upgrade Studio before installing this release.
