import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PACKAGE_ROOT } from "../config.js";

const SOURCE_ROOT = resolve(PACKAGE_ROOT, "../prototypes/supervisor-timeline");

export interface ActivityAsset {
  body: Buffer;
  contentType: string;
}

const assetFiles = new Map<string, { file: string; contentType: string }>([
  ["activity.css", { file: "styles.css", contentType: "text/css; charset=utf-8" }],
  ["activity.js", { file: "app.js", contentType: "text/javascript; charset=utf-8" }],
  ["favicon.svg", { file: "favicon.svg", contentType: "image/svg+xml" }],
]);

export class ActivityUiAssets {
  private readonly index: Buffer;
  private readonly assets = new Map<string, ActivityAsset>();

  public constructor() {
    const source = readFileSync(resolve(SOURCE_ROOT, "index.html"), "utf8")
      .replace('<html lang="fr">', '<html lang="fr" data-supervisor-runtime="true">')
      .replace("Maquette autonome et sans données réelles du fil d’activité Kriton Supervisor.", "Fil local des événements du projet supervisé par Kriton.")
      .replace("connect-src 'none'", "connect-src 'self'")
      .replace('<link rel="icon" href="/favicon.svg"', '<link rel="icon" href="/_supervisor/assets/favicon.svg"')
      .replace('<link rel="stylesheet" href="/styles.css">', '<link rel="stylesheet" href="/_supervisor/assets/activity.css">')
      .replace('<script src="/app.js" defer></script>', '<script src="/_supervisor/assets/activity.js" defer></script>')
      .replace("Prototype · aucune donnée réelle", "Flux local · données sensibles expurgées");
    this.index = Buffer.from(source, "utf8");
    for (const [name, descriptor] of assetFiles) {
      this.assets.set(name, {
        body: readFileSync(resolve(SOURCE_ROOT, descriptor.file)),
        contentType: descriptor.contentType,
      });
    }
  }

  public indexHtml(): ActivityAsset {
    return { body: this.index, contentType: "text/html; charset=utf-8" };
  }

  public asset(name: string): ActivityAsset | null {
    return this.assets.get(name) ?? null;
  }
}
