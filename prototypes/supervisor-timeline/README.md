# Supervisor timeline prototype

Shared presentation source for the isolated public prototype and the local,
read-only Supervisor activity view.

In static mode, the prototype:

- reads the project slug from `/<project-name>`;
- uses synthetic events only;
- keeps newest events at the bottom of a scrollable vertical timeline;
- exposes filters and a demo-only local event simulation;
- contains no backend connection, credentials, live project data, or write path.

`Simuler un événement` exists only to review dynamic timeline behavior. Remove
that control when real Supervisor event ingestion is connected; live events
must replace it rather than coexist with it in the operational interface.

The Supervisor loads the same HTML/CSS/JS with
`data-supervisor-runtime="true"`. Runtime mode removes the simulation control,
loads redacted SQLite snapshots, then listens to the daemon's local SSE stream.
It remains one shared server: there is no app instance per project. The public
preview always stays in static mode and never receives real Supervisor data.

## Local preview

```bash
node prototypes/supervisor-timeline/server.mjs
```

Open `http://127.0.0.1:8790/factures_platform`.

## Tests

```bash
node --test prototypes/supervisor-timeline/test.mjs
```

## Public preview

The repository includes an isolated HTTP-only Nginx server block under
`deploy/nginx/`. It serves only `index.html`, `styles.css`, `app.js`, and
`favicon.svg`; all pages are `noindex` and use a restrictive CSP. This preview
must not be connected to Supervisor state or populated with real findings.

Current review URL:

```text
http://supervisor-preview.164.132.106.135.sslip.io/factures_platform
```

Install or refresh the isolated host:

```bash
sudo cp prototypes/supervisor-timeline/deploy/nginx/supervisor-preview.conf \
  /etc/nginx/sites-available/supervisor-preview.conf
sudo ln -s /etc/nginx/sites-available/supervisor-preview.conf \
  /etc/nginx/sites-enabled/supervisor-preview.conf
sudo nginx -t
sudo systemctl reload nginx
```

Disable the public Preview without touching another Nginx host:

```bash
sudo unlink /etc/nginx/sites-enabled/supervisor-preview.conf
sudo nginx -t
sudo systemctl reload nginx
```
