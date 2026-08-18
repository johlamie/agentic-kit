const path = require("node:path");
const os = require("node:os");

const stateRoot = process.env.SUPERVISOR_DATA_DIR || path.join(os.homedir(), ".local/state/agentic-kit/supervisor");
const logRoot = path.join(stateRoot, "logs");

module.exports = {
  apps: [{
    name: "agentic-supervisor",
    cwd: __dirname,
    script: "dist/src/index.js",
    interpreter: process.execPath,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    min_uptime: "10s",
    max_restarts: 10,
    restart_delay: 2000,
    kill_timeout: 10000,
    time: false,
    out_file: path.join(logRoot, "supervisor.out.log"),
    error_file: path.join(logRoot, "supervisor.error.log"),
    merge_logs: true,
    env: {
      NODE_ENV: "production",
      NO_COLOR: "1",
    },
  }],
};
