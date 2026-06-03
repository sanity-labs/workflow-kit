---
"@sanity-labs/workflow-kit": minor
---

Support `@sanity/color-input` color objects in `WORKFLOW_QUERY`. Stage and off-ramp `color` values are now projected with `coalesce(color.hex, color)`, so definitions authored with the new color picker resolve to a hex string while legacy hex-string values keep working unchanged.
