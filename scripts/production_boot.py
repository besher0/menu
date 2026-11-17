"""Called by test-isolated.py with its freshly created, ordinary PostgreSQL role and database."""
import json
import os
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

def verify(source, env, uri, directory):
    target = urlsplit(uri)
    if target.hostname != '127.0.0.1' or target.username != 'credential_probe' or target.path != '/ordersawa_credential_probe':
        raise ValueError('Expected dedicated local fixture')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    settings = {**env, 'NODE_ENV':'production','API_HOST':'127.0.0.1','DATABASE_URL':uri,'DIRECT_URL':uri,
                'JWT_SECRET':secrets.token_hex(32),'PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY':secrets.token_hex(32),
                'ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT':'1','ORDERSAWA_DEMO_UPLOADS_DIR':str(directory/'uploads')}
    cases = {'valid':{},'missing-jwt':{'JWT_SECRET':''},'weak-jwt':{'JWT_SECRET':'ab'*32},
             'bad-hmac':{'PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY':'00'*32},
             'shared-key':{'PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY':settings['JWT_SECRET']},
             'invalid-database':{'DATABASE_URL':'invalid'},
             'bad-db-password':{'DATABASE_URL':uri.replace(target.password,secrets.token_hex(32))},
             'demo-flag':{'SEED_DEMO_RESTAURANT':'true'}}
    result={}
    for name, override in cases.items():
        with socket.socket() as probe:
            probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
        config={**settings,**override,'PORT':str(port)}
        with tempfile.TemporaryFile() as log:
            proc=subprocess.Popen([shutil.which('node'),'dist/main.js'],cwd=source/'apps/api',env=config,stdout=log,stderr=log)
            try:
                if name=='valid':
                    for attempt in range(120):
                        if proc.poll() is not None:raise RuntimeError('Valid production fixture exited before readiness')
                        try:
                            with opener.open('http://127.0.0.1:'+str(port)+'/health/ready',timeout=1) as response:
                                if response.status==200:break
                        except (urllib.error.URLError,TimeoutError):pass
                        time.sleep(.15)
                    else:raise RuntimeError('Production readiness timed out')
                elif proc.wait(timeout=25)==0:raise RuntimeError('Unsafe production configuration accepted: '+name)
            finally:
                if proc.poll() is None:proc.terminate()
                proc.wait(timeout=15)
            log.seek(0); data=log.read()
            sensitive=[target.password,settings['JWT_SECRET'],settings['PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY'],uri,config['DATABASE_URL'] if name=='bad-db-password' else uri]
            if any(v.encode() in data for v in sensitive):raise RuntimeError('Credential appeared in captured boot log: '+name)
            result[name]={'status':'PASS','credentialInLog':False}
    return result
