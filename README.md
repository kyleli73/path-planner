# Bubblotics Path Planner

Built for **FTC BIOBUZZ 2026-27**. Field orientation: the red alliance is at the bottom (y < 72) and the blue alliance at the top (y > 72). `field.png` is the default field image; an uploaded image overrides it ("Reset field image" restores it).

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
- Mirror is a 180-degree rotation of the whole auto: (x, y, h) -> (144 - x, 144 - y, h + 180), heading normalized to [0, 360), applied to start pose, control points, end points and obstacles; it also flips the project alliance (Red/Blue).
- Built-in obstacles (HIVE, 4 FLOWERs) live in `src/field.js`; LOADING ZONES and GARDENS are zones, drawn under the Zones toggle. The Start pose inspector warns about G304 violations.
- Each segment end can carry an action (launch, intakePollen, flower, garden, park) with wait seconds; Java export adds `ACTIONS` and `ACTION_WAITS` arrays in path order.
- Press `?` in the app for shortcuts.

## Layout

`src/bezier.js` curve math, `heading.js`, `profile.js` timing, `collision.js` footprint checks, `field.js` BIOBUZZ field table and start legality, `codegen.js` Java export, `store.js` reducer + undo, `render.js` canvas, `ui.js` DOM, `main.js` persistence.
