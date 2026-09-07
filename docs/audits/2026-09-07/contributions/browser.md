# Browser contribution — codex / qa

Verdict: FAIL for malformed-snapshot presentation (BR-01); scoped normal rendering checks PASS.
Exact audited URL: http://audit-fixture.invalid/.
This reserved synthetic origin was fully intercepted by Playwright; it was not contacted over the network.
Browser: Chromium 150.0.7871.114. Tool: codex. Role: qa.

## Scope and isolation

Actual unmodified control.html, control.js, control.css, shared.css and favicon.svg were rendered in a real browser.
Each of the eight cases used a fresh browser context, blocked service workers, and an all-requests route.
Only the synthetic origin and explicitly listed fixture paths were fulfilled; all other requests were aborted.
All observed requests were GETs. There were zero attempted external requests, including in the HTML injection case.
No accounts, credentials, existing browser page content, real server, database, Telegram or live application were accessed.
No source file was changed. No runtime protection was disabled.
EventSource was intentionally absent in each test context to exercise the client's polling fallback.
This is a rendered component test with MOCK HTTP, not a real HTTP/server/SSE/authentication integration or a delivered software experiment.

Fixture: fixtures/browser/qa/run-control-browser.js (the exact successful tool callback, including inspected asset bytes).
Evidence: evidence/browser/results.json and eight PNG screenshots.
The successful browser batch completed in 17.7 seconds, excluding earlier tool diagnosis, asset inspection and evidence export.
Source hashes:
- control.html: 818040182321abf0a9de0b060ab49018774647c8ce148f57f8574b47d37f0bf8
- control.js: 6ecf1ab8ae473bcac990137f4354564f6878fc5ef362eed13ff16201d52b3684
- control.css: c73dd87e0108b807ae9783e9e1e1b77cbebc0fbacfb1e20c54273e356ead60e4
- shared.css: 0b3d089adf3d31b5729b61b9712d8bcba4f8251e4d8c3f0f82f8e31a0d03781b

## Derived user script and results

1. ✓ Open a fresh populated control view at 390×844, 768×1024, 1440×900 and 1920×1080.
   Expected: one active project, one outstanding human request, a recent inactive project, readable cards and no offscreen content.
   Observed: all four summaries/counts correct; document width equals viewport width and geometry scan found no content overflow.
   Screenshots at all four sizes were visually inspected. The blocked-work sentence is distinct from the requested-action sentence.
   Evidence: populated-390.png, populated-768.png, populated-1440.png, populated-1920.png.
2. ✓ Use Tab, Enter on the skip link, Tab and Enter on the first project link at 390×844.
   Expected: visible focus, skip navigation and reachable project link.
   Observed: the first focused element is "Aller au contenu", its top is 12px and its outline is solid.
   After skip navigation, focus is on the synthetic project link with a solid outline.
   Enter requested /synthetic-project and its synthetic heading rendered.
   Measurement limitation: the fixture reads p.url() before awaiting the target heading, so raw navigation.url retains the preceding fragment URL; the GET request and target heading establish activation.
   The real project thread page is NOT TESTED.
3. ✓ Open an empty control view at 390×844.
   Expected: explicit empty state and no fictional project rows.
   Observed: empty welcome displayed, project panels hidden, counts zero, no overflow.
   Evidence: empty-390.png.
4. ✓ Return a synthetic HTTP 503, then a valid response on the next normal polling interval at 1440×900.
   Expected: visible unavailable state followed by recovery without reloading.
   Observed: "Reconnexion…" and an explicit error; after the next request the populated summary returns and the error hides.
   The browser logs the expected HTTP 503 resource failure; no JavaScript exception was observed.
   Evidence: error-recovery-1440.png and results.json recovery fields.
5. ✗ Return syntactically valid HTTP 200 JSON {} at 1440×900.
   Expected: invalid/unavailable snapshot.
   Observed: "En direct", "v— · base ok", no interventions and an empty-project welcome.
   BR-01 is a client robustness problem under injected response-contract failure; real server emission of {} is NOT ESTABLISHED.
   Evidence: malformed-1440.png.
6. ✓ Supply synthetic HTML with an external image URL/onerror payload and a long project name at 390×844.
   Expected: text remains inert, no external requests or injected image, layout usable.
   Observed: zero img elements, auditInjected false, zero denied/external requests and no overflow.
   The malformed project slug is reduced to a same-origin /evil href; it was not activated.
   This limited payload does not establish general resistance to prompt injection or all XSS classes.
   Evidence: injection-390.png and results.json.

## Confirmed finding

BR-01: The control UI converts a schema-invalid HTTP 200 response into a healthy empty state.
Severity: medium. Proof: OBSERVED on a fault-injected HTTP response. Confidence: high for the client behavior.
Source: supervisor/ui/static/control.js:175-197 and 358-369.
Reason: missing daemon data defaults to database ok, missing collections default to empty lists, then loadSnapshot clears the error.
Impact: misleading status for the human operator. This is neither a Supervisor audit PASS nor evidence of gate bypass.
Minimal fix: validate required envelope/status/collection fields before rendering; reuse the existing error and recovery state.
Verification: HTTP 200 {} must show an invalid state without healthy/empty assertions, then a later valid response must recover.
Complete structured finding: contributions/browser.json.

## Proven strengths to retain

- Native anchor navigation, an effective keyboard skip link and visible focus work in the tested mobile flow.
- Responsive normal/empty layouts are usable at the four required sizes; no geometry overflow was observed.
- A real browser shows that the DOM-building client renders the tested HTML payload as inert text.
- HTTP failure is visible and the polling fallback recovers automatically.
- The distinction between requested human action and its blocking scope is readable in the rendered UI.

## Tool failures, cleanup and limits

The browser tool VM does not supply Node dynamic import, require or URL.
The first routing attempt used URL and failed before page loading; this was an audit fixture/environment defect.
Its context was identified solely by the audit route callback and closed; the corrected run parses its fixed synthetic origin without URL.
Final check found zero remaining audit contexts. No user browser context was closed.
The source assets were transferred as strings into the tool instead of reading files in the browser server process.

NOT TESTED: real daemon endpoint/authentication/security headers, SSE lifecycle, project detail UI,
screen-reader operation, numeric contrast audit, browser zoom, slow-3G real network performance, deployed public URL,
full application delivery, G1-G4 execution, Claude-with/without-kit productivity or autonomy.
No UI numeric score or overall delivery PASS is assigned.

Proposed shared-memory update: none. This independent audit must not write shared or personal memories.
