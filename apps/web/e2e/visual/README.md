# Visual regression harness

Two scripts used during the frontend redesign to prove a change is visually
inert, or to see exactly what it moved.

```
OUT=<dir> node e2e/visual/capture.mjs          # capture the route matrix
node e2e/visual/compare.mjs <before> <after>   # compare two captures
```

`capture.mjs` walks a fixed route set at two viewports in both themes and
suppresses animation before each shot. Without that suppression twelve of the
thirty-two frames differ between two identical runs, which makes the capture
useless as an oracle.

`compare.mjs` reports two numbers per frame. `any` is every pixel that differs
at all; `significant` is those differing by more than 8 per channel. Antialiasing
on a glyph edge shows up as a fraction of a percent of `any` with a maximum
delta of 1 and zero `significant`, which is why a byte hash is the wrong test.
A frame fails when more than 0.02% of it differs significantly.

The signed-out homepage remains non-deterministic even with animation
suppressed; compare it by computed style rather than by pixel.
