# Bubblotics Path Planner

In-house autonomous path planner and visualizer for [Pedro Pathing](https://pedropathing.com) (FTC). Build an auto out of PathChains and Segments on a 144 x 144 in field, check footprint, collisions and timing, then copy Java that drops into an OpMode.

Plain HTML, CSS and vanilla ES modules. No build step, no network calls. Installable as an offline PWA. Work autosaves to `localStorage`; an uploaded field image lives in IndexedDB.

## Run locally

```sh
python3 -m http.server      # from this folder, then open http://localhost:8000
node --test                 # unit tests (pure modules only)
```

## Deploy to GitHub Pages

Push to a repo, then Settings > Pages > Deploy from branch `main` / root. All URLs are relative, so it works under `/repo-name/` or a custom domain. When you add or rename shipped files, update the `SHELL` list and `CACHE` version in `sw.js`.

## Notes

- Coordinates: origin bottom-left, +x right, +y up, inches; heading in degrees (0 = +x, CCW positive), exported as `Math.toRadians`.
- Heading `linear` takes the shortest turn between start and end heading. `constant` holds the end heading of the segment.
- Timing is an estimate: curvature-limited velocity (`v <= sqrt(maxLatAccel / curvature)`), forward/backward accel passes, capped by `maxVel`, at rest at both ends of every chain. It ignores tangent corners at segment joins and drivetrain dynamics; use it for comparing options, not as a guarantee.
- Mirror maps x to 144 - x and heading to 180 - h.
- Press `?` in the app for shortcuts.

## Layout

`src/bezier.js` curve math, `heading.js`, `profile.js` timing, `collision.js` footprint checks, `codegen.js` Java export, `store.js` reducer + undo, `render.js` canvas, `ui.js` DOM, `main.js` persistence.
