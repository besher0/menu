"""Check source inputs and compiled browser assets without printing matched values."""
import argparse
import base64
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

root = Path(__file__).resolve().parents[1]
private_names = {".netrc", "_netrc", "id_rsa", "id_ed25519", "credentials.json"}
private_suffixes = {".dump", ".backup", ".pfx", ".p12", ".key", ".pem"}
patterns = {
    "npm-token": rb"(?im)^\s*(?://[^\r\n=]+:)?_authToken\s*=\s*(?!\s*\$\{)[^\s\r\n]+",
    "owner-fallback": rb"""\bownerPassword\s*\?\?\s*["'][^"'\r\n]+["']""",
    "literal-hash-input": rb"""\bbcrypt\.hash(?:Sync)?\(\s*["'][^"'\r\n]+["']""",
    "private-key": rb"-----BEGIN (?:OPENSSH |RSA |EC |ENCRYPTED )?PRIVATE KEY-----",
    "access-token": rb"(?:gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[a-zA-Z0-9_]{50,}|AKIA[A-Z0-9]{16})",
    "jwt": rb"eyJ[\w-]{12,}\.[\w-]{12,}\.[\w-]{16,}",
    "embedded-password": rb"(?im)^\s*(?:const\s+(?:newPassword|ownerPassword)|ownerPassword\s*:)\s*(?:=\s*)?[\"'][^\"'\r\n]{8,}[\"']",
    "literal-server-secret": rb"(?im)^\s*(?:export\s+)?(?:JWT_SECRET|PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY|CLOUDINARY_API_SECRET|WEBHOOK_SECRET|INTERNAL_RESTAURANT_REWRITE_SECRET|STAGING_SMOKE_PASSWORD|STAGING_BOOTSTRAP_ADMIN_PASSWORD)[ \t]*=[ \t]*[\"']?[A-Za-z0-9_+/=.-]{12,}",
    "public-secret-setting": rb"(?im)^\s*(?:export\s+)?NEXT_PUBLIC_(?:\w*_)?(?:PRIVATE_KEY|SECRET|PASSWORD|DATABASE_URL|ACCESS_TOKEN)\s*=\s*[^#\s\r\n]+",
}
dsn = re.compile(rb"""postgres(?:ql)?://[^:\s/@'"]+:([^@\s/'"{}]+)@([A-Za-z0-9._-]+)""", re.I)

def inspect(name, data):
    path = Path(name)
    base = path.name.lower()
    if ((base.startswith(".env") and base not in {".env.example", ".env.staging.example"}) or base in private_names
            or path.suffix.lower() in private_suffixes):
        return ["private-file"]
    found = [rule for rule, pattern in patterns.items() if re.search(pattern, data)]
    for match in dsn.finditer(data):
        if base == ".env.example" and match[1] == b"PASSWORD" and match[2].upper() in (b"POOLER_HOST", b"DIRECT_HOST"):
            continue
        found.append("literal-database-credential")
        break
    return found

def snapshot_paths():
    excluded = {".git", "node_modules", "dist", ".next", ".vitest-cache", "__pycache__", "coverage", "qa-output"}
    for parent, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in excluded]
        for name in files:
            if not name.endswith(".tsbuildinfo"):
                yield (Path(parent)/name).relative_to(root).as_posix()

def scan(names, index=False):
    failures = []
    for name in names:
        path = root/name
        if path.is_symlink():
            failures.append((name, "symbolic-link")); continue
        data = subprocess.check_output(["git","show",":"+name],cwd=root) if index else path.read_bytes()
        failures.extend((name, rule) for rule in inspect(name, data))
    for name, rule in failures:print(f"{name} [{rule}]")
    return len(failures)

def check_canaries(path, markers):
    needles = set()
    for marker in markers:
        b = marker.encode()
        needles.update([b, b.hex().encode(), base64.b64encode(b).rstrip(b"="), quote(marker,safe="").encode()])
    files = [p for p in path.rglob("*") if p.is_file()]
    if not files:raise RuntimeError("No browser assets found")
    for p in files:
        data = p.read_bytes()
        if any(x in data for x in needles) or inspect(p.name,data):
            raise RuntimeError("Credential scan failure in browser asset: "+str(p.relative_to(path)))
    return len(files)

if __name__ == "__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--snapshot", action="store_true", help="unpacked candidate without a Git index")
    args=ap.parse_args()
    if args.snapshot:
        names=list(snapshot_paths());fail=scan(names)
    else:
        names=[p for p in subprocess.check_output(["git","ls-files","-z"],cwd=root).decode().split("\0") if p]
        fail=scan(names, index=True)
    if not names:raise SystemExit("No source files selected")
    print(f"Scanned {len(names)} files; {fail} rule matches")
    sys.exit(bool(fail))
