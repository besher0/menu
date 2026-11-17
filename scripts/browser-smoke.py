"""Browser smoke for a fresh candidate build. Serves one local synthetic menu."""
import http.server
import json
import os
import shutil
import secrets
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

source = Path(__file__).resolve().parents[1]
marker = "QA-Meal-Only"
fixture = {
    "restaurant": {"id":"smoke","slug":"preview-ordersawa","name":"QA Kitchen","showPrices":True,"currency":"USD","branches":[]},
    "categories": [{"id":"category","slug":"meals","name":"Meals","sortOrder":0,"productsCount":1}],
    "products": [{"id":"meal","slug":"meal","name":marker,"currency":"USD","basePrice":5,"basePriceExact":"5","sortOrder":0,"moodKeys":[],"price":5,"category":{"id":"category","slug":"meals","name":"Meals"},"images":[],"options":[],"ingredients":[],"media":{}}],
    "menus": [], "theme": {}, "networkWhatsappCheckoutEnabled":False,
}

class Fixture(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] != "/public/menus/preview-ordersawa":
            self.send_error(404)
            return
        body = json.dumps({"data":fixture}).encode()
        self.send_response(200)
        self.send_header("Content-Type","application/json")
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass

def main():
    fixture["theme"] = json.loads(subprocess.check_output(["node", "-e", "console.log(JSON.stringify(require('@menu/shared').ABO_MALEK_THEME))"], cwd=source))
    fixture["theme"].setdefault("publicUi", {})["whatsappOrderingEnabled"] = True
    fixture["theme"]["layout"]["categoryProductListLayout"] = "single"
    fixture["theme"]["publicUi"]["template"] = "default"
    browser = os.environ.get("CHROME_BIN") or shutil.which("google-chrome")
    if not browser:
        raise RuntimeError("Set CHROME_BIN to the installed Chrome executable")
    with http.server.ThreadingHTTPServer(("127.0.0.1",0),Fixture) as api, tempfile.TemporaryDirectory() as temp:
        threading.Thread(target=api.serve_forever, daemon=True).start()
        with socket.socket() as probe:
            probe.bind(("127.0.0.1",0))
            port = probe.getsockname()[1]
        url=f"http://127.0.0.1:{port}/m/preview-ordersawa/menu?category=all&display=list"
        rewrite_secret=secrets.token_hex(32)
        internal_headers={'x-ordersawa-internal-restaurant-rewrite':rewrite_secret,'x-ordersawa-internal-restaurant-slug':'preview-ordersawa'}
        next_bin=source/"node_modules/next/dist/bin/next"
        with (Path(temp)/"next.log").open("wb") as log:
            proc=subprocess.Popen(["node",next_bin,"start","-H","127.0.0.1","-p",str(port)],cwd=source/"apps/web",
                env={**os.environ,"INTERNAL_RESTAURANT_REWRITE_SECRET":rewrite_secret,"ORDERSAWA_PREVIEW_INTERNAL_API_URL":f"http://127.0.0.1:{api.server_port}"},stdout=log,stderr=log)
            try:
                client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
                for attempt in range(60):
                    if proc.poll() is not None: raise RuntimeError("Smoke web server exited")
                    try:
                        with client.open(urllib.request.Request(url,headers=internal_headers),timeout=10) as response:
                            if marker.encode() in response.read(): break
                    except urllib.error.URLError: pass
                    time.sleep(.2)
                else: raise RuntimeError("Fixture menu did not render: "+(Path(temp)/"next.log").read_text(errors="replace")[-1200:])
                profile=Path(temp)/"chrome"
                chrome=subprocess.Popen([browser,"--headless=new","--disable-gpu","--disable-background-networking",
                    "--no-first-run","--window-size=390,850","--no-proxy-server","--user-data-dir="+str(profile),
                    "--remote-debugging-address=127.0.0.1","--remote-debugging-port=0",url],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                try:
                    subprocess.run(["node",source/"scripts/browser-dom.cjs",profile,url],env={**os.environ,"BROWSER_SMOKE_REWRITE_SECRET":rewrite_secret},timeout=40,check=True)
                finally:
                    if chrome.poll() is None:
                        chrome.terminate()
                    chrome.wait(timeout=15)
                print("Chrome DOM smoke passed (390px)")
            finally:
                proc.terminate()
                proc.wait(timeout=15)
                api.shutdown()
if __name__ == "__main__":
    main()
