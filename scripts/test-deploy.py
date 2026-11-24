#!/usr/bin/env python3
"""Check deployment CLI and privilege escalation without touching the host."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]


@unittest.skipIf(os.geteuid() == 0, "CLI test expects an unprivileged caller")
class DeployTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="gyds-deploy-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copy(SOURCE / "deploy.sh", self.root)
        (self.root / "package.json").write_text("{}")
        (self.root / ".env.example").write_text("Supabase settings template\n")
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.sudo_args = self.root / "sudo-args"
        sudo = self.bin / "sudo"
        sudo.write_text(
            '#!/usr/bin/env bash\nprintf "%s\\n" "$*" > "$SUDO_ARGS"\nexit 73\n'
        )
        sudo.chmod(0o700)
        self.env = {
            **os.environ,
            "PATH": str(self.bin) + ":" + os.environ["PATH"],
            "SUDO_ARGS": str(self.sudo_args),
        }

    def run_script(self, *args):
        return subprocess.run(
            ["bash", str(self.root / "deploy.sh"), *args],
            env=self.env, text=True, capture_output=True, timeout=10,
        )

    def test_help_explains_single_command_bootstrap_without_escalating(self):
        result = self.run_script("--help")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("creates a non-login service account", result.stdout)
        self.assertFalse(self.sudo_args.exists())

    def test_invalid_options_stop_before_escalation(self):
        for args in (("--unknown",), ("--port",), ("--port", "80"),
                     ("--port", "65536"), ("--service", "../bad"),
                     ("--service-user", "Root"),
                     ("--host", "127.0.0.1\nExecStart=bad")):
            with self.subTest(args=args):
                self.assertNotEqual(self.run_script(*args).returncode, 0)
        self.assertFalse(self.sudo_args.exists())

    def test_normal_invocation_requests_admin_access_once(self):
        result = self.run_script("--service", "test-dashboard", "--port", "5050")
        self.assertEqual(result.returncode, 73)
        self.assertIn("test-dashboard", self.sudo_args.read_text())
        self.assertIn("5050", self.sudo_args.read_text())
        self.assertIn("Requesting administrator access", result.stdout)

    def test_shell_syntax_is_valid(self):
        result = subprocess.run(
            ["bash", "-n", str(self.root / "deploy.sh")],
            text=True, capture_output=True, timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
