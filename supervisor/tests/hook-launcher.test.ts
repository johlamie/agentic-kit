import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";
import { PACKAGE_ROOT } from "../src/config.js";

const repositoryRoot = resolve(PACKAGE_ROOT, "..");

test("hook launcher resolves the repository when invoked through the installed symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "supervisor-hook-launcher-"));
  try {
    const claudeRoot = join(root, ".claude");
    const fakeBin = join(root, "bin");
    const capturePath = join(root, "node-argument.txt");
    mkdirSync(claudeRoot, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    symlinkSync(resolve(repositoryRoot, "global/hooks"), join(claudeRoot, "hooks"), "dir");

    const fakeNode = join(fakeBin, "node");
    writeFileSync(fakeNode, "#!/usr/bin/env bash\nprintf '%s\\n' \"$1\" > \"$HOOK_CAPTURE\"\n", { mode: 0o700 });
    chmodSync(fakeNode, 0o700);

    const result = spawnSync("/bin/bash", [join(claudeRoot, "hooks/supervisor-hook.sh")], {
      encoding: "utf8",
      input: "{}",
      env: {
        ...process.env,
        HOOK_CAPTURE: capturePath,
        PATH: `${fakeBin}${delimiter}${process.env.PATH ?? "/usr/bin:/bin"}`,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(capturePath, "utf8").trim(),
      resolve(PACKAGE_ROOT, "dist/src/hooks/forwarder.js"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
