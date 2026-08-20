# Local artifacts

This directory contains machine-local evidence produced while developing or
auditing the kit. Temporary files are intentionally excluded from Git.

Store browser screenshots under a run-specific directory:

```text
.artifacts/screenshots/<run-id>/
├── manifest.json
├── <scenario>-mobile-390.png
├── <scenario>-tablet-768.png
├── <scenario>-desktop-1440.png
└── <scenario>-desktop-1920.png
```

Use stable, non-secret run identifiers. Record the tested URL without query
strings, the viewport, the scenario, and the capture time in `manifest.json`.
Never store tokens, credentials, private user data, or URLs containing secrets.

Raster files must not be written at the repository root. Images that are
intentional, stable test inputs belong instead under the relevant
`tests/fixtures/visual/` directory and may be versioned after review.
