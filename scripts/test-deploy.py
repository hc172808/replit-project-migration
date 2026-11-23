#!/usr/bin/env python3
"""Isolated deployment-script checks; never install packages or change services."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]
NODE = """#!/usr/bin/env bash
set -eu
printf 'node %s\\n' "$*" >> "$CALLS"
if [[ "$*" == *'vite.js build'* ]]; then
  [[ "${FAIL_BUILD:-0}" == 0 ]] || exit 17
  mkdir -p .output/server
  touch .output/server/index.mjs
fi
"""
NPM = """#!/usr/bin/env bash
set -eu
printf 'npm %s\\n' "$*" >> "$CALLS"
"""


@unittest.skipIf(os.geteuid() == 0, "Script intentionally rejects root")
class DeployTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="gyds-deploy-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copy(SOURCE / "deploy.sh", self.root)
        (self.root / "package.json").write_text("{}")
        (self.root / ".env.example").write_text("EXAMPLE=replace-me\n")
        (self.root / ".env").write_text("EXAMPLE=configured\n")
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for name, content in (("node", NODE), ("npm", NPM)):
            file = self.bin / name
            file.write_text(content)
            file.chmod(0o700)
        self.calls = self.root / "calls"
        self.env = {
            **os.environ,
            "HOME": str(self.root),
            "PATH": str(self.bin) + ":" + os.environ["PATH"],
            "CALLS": str(self.calls),
        }

    def run_script(self, *args):
        return subprocess.run(
            ["bash", str(self.root / "deploy.sh"), *args],
            env=self.env, text=True, capture_output=True, timeout=10,
        )

    def test_help_has_no_side_effects(self):
        result = self.run_script("--help")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.calls.exists())

    def test_invalid_options_never_build(self):
        for args in (("--unknown",), ("--port",), ("--port", "80"),
                     ("--port", "65536"), ("--service", "../bad"),
                     ("--host", "127.0.0.1\nExecStart=bad")):
            with self.subTest(args=args):
                self.assertNotEqual(self.run_script(*args).returncode, 0)
        self.assertFalse(self.calls.exists())

    def test_missing_env_stops_for_configuration(self):
        (self.root / ".env").unlink()
        result = self.run_script("--build-only")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Created .env", result.stderr)
        self.assertEqual((self.root / ".env").stat().st_mode & 0o777, 0o600)
        self.assertFalse(self.calls.exists())

    def test_build_only_uses_npm_without_mutating_lock_format(self):
        result = self.run_script("--build-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls.read_text()
        self.assertIn("npm install --include=dev --package-lock=false", calls)
        self.assertIn("--env-file=.env", calls)
        self.assertTrue((self.root / ".output/server/index.mjs").exists())
        self.assertFalse((self.root / "package-lock.json").exists())

    def test_npm_lock_uses_clean_install(self):
        (self.root / "package-lock.json").write_text("{}")
        result = self.run_script("--build-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("npm ci --include=dev", self.calls.read_text())

    def test_failed_build_never_reports_success(self):
        self.env["FAIL_BUILD"] = "1"
        result = self.run_script("--build-only")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Build succeeded", result.stdout)
        self.assertNotIn("Deployment healthy", result.stdout)


if __name__ == "__main__":
    unittest.main()
