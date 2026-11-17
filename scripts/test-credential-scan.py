"""Exercise the scanner with generated, disposable inputs. No network access required."""
import contextlib
import io

import runpy
import secrets
import subprocess
import tempfile
import unittest
from pathlib import Path

scanner = runpy.run_path(str(Path(__file__).with_name("scan-source.py")))


class CredentialScanner(unittest.TestCase):
    def test_file_rules(self):
        inspect = scanner["inspect"]
        sample = secrets.token_hex(24).encode()
        connection = b"postgresql://service:" + sample + b"@host.example/app"
        self.assertIn("private-file", inspect(".env.production", b""))
        self.assertEqual(inspect(".env.staging.example", b"JWT_SECRET=\nDATABASE_URL=\n"), [])
        self.assertIn("literal-database-credential", inspect(".env.staging.example", connection))
        for key in (b"JWT_SECRET", b"INTERNAL_RESTAURANT_REWRITE_SECRET", b"STAGING_SMOKE_PASSWORD", b"STAGING_BOOTSTRAP_ADMIN_PASSWORD"):
            self.assertIn("literal-server-secret", inspect(".env.staging.example", key + b"=" + sample))
        self.assertIn("literal-database-credential", inspect("app.ts", connection))
        self.assertIn("npm-token", inspect(".npmrc", b"//registry.example/:_authToken=" + sample))
        self.assertEqual(inspect(".npmrc", b"//registry.example/:_authToken=${NPM_TOKEN}"), [])
        placeholder = b"postgresql://USER:" + b"PASSWORD@POOLER_HOST/app"
        self.assertEqual(inspect(".env.example", placeholder), [])
        self.assertTrue(inspect(".env.example", placeholder.replace(b"HOST/", b"HOST_OTHER/")))
        self.assertIn("owner-fallback", inspect("admin.ts", b"ownerPassword" + b" ?? " + b'"' + sample + b'"'))
        self.assertIn("literal-hash-input", inspect("seed.ts", b"bcrypt." + b"hash(" + b'"' + sample + b'", 10)'))

    def test_compiled_assets(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            asset = path / "client.js"
            marker = secrets.token_hex(32)
            asset.write_text("public menu")
            self.assertEqual(scanner["check_canaries"](path, [marker]), 1)
            asset.write_text(marker)
            with self.assertRaisesRegex(RuntimeError, "client.js"):
                scanner["check_canaries"](path, [marker])

    def test_index_is_checked_even_if_working_copy_is_clean(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            subprocess.run(["git", "init", "-q", temp], check=True)
            path = root / "settings.txt"
            path.write_bytes(b"JWT_SECRET=" + secrets.token_hex(32).encode())
            subprocess.run(["git", "-C", temp, "add", path.name], check=True)
            path.write_text("clean working copy")
            scan = scanner["scan"]
            original = scan.__globals__["root"]
            try:
                scan.__globals__["root"] = root
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(scan([path.name], index=True), 1)
                    self.assertEqual(scan([path.name]), 0)
            finally:
                scan.__globals__["root"] = original


if __name__ == "__main__":
    unittest.main()
