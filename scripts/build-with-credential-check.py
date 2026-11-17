"""Build with ephemeral server-only canaries and reject their appearance in browser assets or build output."""
import json
import os
import runpy
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
scan=runpy.run_path(str(root/'scripts/scan-source.py'))
def main():
    env=os.environ.copy()
    dbpass=secrets.token_hex(32)
    uri=f'postgresql://build_only:{dbpass}@127.0.0.1:1/build_only'
    markers={k:secrets.token_hex(32) for k in
             ['JWT_SECRET','PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET']}
    env.update(markers,DATABASE_URL=uri,DIRECT_URL=uri)
    values=[*markers.values(),dbpass,uri]
    with tempfile.TemporaryFile() as log:
        res=subprocess.run([shutil.which('npm.cmd' if os.name=='nt' else 'npm'),'run','build'],
                           cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
        log.seek(0)
        text=log.read()
    if any(v.encode() in text for v in values):
        raise SystemExit("Server canary present in build log; suppressed")
    if res.returncode:
        sys.stderr.buffer.write(text);raise SystemExit(res.returncode)
    assets=scan['check_canaries'](root/'apps/web/.next/static',values)
    print(json.dumps({'build':'PASS','browserAssets':assets,'canariesInAssets':0,'literalCanariesInBuildLog':0}))
if __name__=='__main__':main()
