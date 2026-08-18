#!/usr/bin/env node
import { ArtifactStore } from "./artifacts.js";
import { AuditDispatcher } from "./audits/dispatcher.js";
import { loadConfig } from "./config.js";
import { CliCodexRunner } from "./codex/runner.js";
import { PromptBuilder } from "./codex/prompt-builder.js";
import { SupervisorDatabase } from "./db.js";
import { Logger } from "./logger.js";
import { AuditQueue } from "./queue.js";
import { safeError } from "./security/redact.js";
import { SupervisorServer } from "./server.js";
import { TelegramClient } from "./telegram/client.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const database = new SupervisorDatabase(config.databasePath);
  const dispatcher = new AuditDispatcher(database, config);
  const telegram = new TelegramClient(config);
  const queue = new AuditQueue(
    database,
    config,
    new CliCodexRunner(config),
    new PromptBuilder(config),
    new ArtifactStore(config),
    telegram,
    logger,
  );
  const server = new SupervisorServer(config, database, dispatcher, telegram, logger);
  const recovery = queue.start();
  await server.listen();
  logger.info("supervisor.started", { host: config.host, port: server.address().port, recovery, level: config.level });

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info("supervisor.stopping", { signal });
    await server.close();
    await queue.stop();
    database.close();
  };
  process.once("SIGINT", () => { void shutdown("SIGINT").then(() => process.exit(0)); });
  process.once("SIGTERM", () => { void shutdown("SIGTERM").then(() => process.exit(0)); });
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: "error", message: "supervisor.fatal", error: safeError(error) })}\n`);
  process.exitCode = 1;
});
