# Supervisor timeline prototype

Isolated, read-only UI proposal for validating a project activity feed before
any integration with the Supervisor HTTP API or SQLite state.

The prototype:

- reads the project slug from `/<project-name>`;
- uses synthetic events only;
- keeps newest events at the bottom of a scrollable vertical timeline;
- exposes filters and a local event simulation;
- contains no backend connection, credentials, live project data, or write path.

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
