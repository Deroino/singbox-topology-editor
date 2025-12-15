import http.server
import json
import os
import socketserver
import sys
import time
from urllib.parse import urlparse, parse_qs

# Import modules
from installer import install_sing_box_core
from proxy_manager import RRProxyManager
from config_handler import (
    get_singbox_env,
    run_singbox_check,
    ensure_config_exists,
    ensure_profiles_dir,
    save_config,
    normalize_profile_name
)
from process_manager import SingBoxProcessManager

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = 19999
WEB_DIR = os.path.join(BASE_DIR, 'web')
CONFIG_PATH = os.path.join(BASE_DIR, 'config', 'config.json')
PROFILES_DIR = os.path.join(BASE_DIR, 'config', 'profiles')

# Determine Binary Name based on OS
import platform
SYSTEM_OS = platform.system()
BIN_NAME = "sing-box.exe" if SYSTEM_OS == "Windows" else "sing-box"
BIN_PATH = os.path.join(BASE_DIR, 'bin', BIN_NAME)

# Global Process Handler
singbox_process = None
process_manager = SingBoxProcessManager(BIN_PATH, CONFIG_PATH)
rr_proxy_manager = RRProxyManager()


class ProxyRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.path = '/index.html'
        elif self.path == '/api/profiles/list':
            self.handle_list_profiles()
            return
        elif self.path.startswith('/api/profiles/load'):
            self.handle_load_profile()
            return
        elif self.path == '/api/core_logs':
            self.handle_core_logs()
            return
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/start':
            self.handle_start()
        elif self.path == '/api/stop':
            self.handle_stop()
        elif self.path == '/api/status':
            self.handle_status()
        elif self.path == '/api/save_config':
            self.handle_save_config()
        elif self.path == '/api/profiles/create':
            self.handle_create_profile()
        elif self.path == '/api/profiles/save':
            self.handle_save_profile()
        elif self.path == '/api/profiles/delete':
            self.handle_delete_profile()
        else:
            self.send_error(404, "API Not Found")

    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def get_json_body(self):
        content_length = int(self.headers['Content-Length'])
        return json.loads(self.rfile.read(content_length))

    # --- Profile Management ---

    def handle_list_profiles(self):
        ensure_profiles_dir(PROFILES_DIR)
        try:
            files = [f for f in os.listdir(PROFILES_DIR) if f.endswith('.json')]
            self.send_json({"profiles": files})
        except Exception as e:
            self.send_json({"status": "error", "message": str(e)})

    def handle_load_profile(self):
        query = parse_qs(urlparse(self.path).query)
        raw = query.get('name', [None])[0]
        name = normalize_profile_name(raw)
        if not name:
            self.send_json({"status": "error", "message": "Invalid or missing profile name"})
            return
        path = os.path.join(PROFILES_DIR, name)
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    data = json.load(f)
                self.send_json({"status": "success", "data": data})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)})
        else:
            self.send_json({"status": "error", "message": "Profile not found"})

    def handle_create_profile(self):
        data = self.get_json_body()
        raw = data.get('name')
        name = normalize_profile_name(raw)
        if not name:
            self.send_json({"status": "error", "message": "Invalid or missing profile name"})
            return
        path = os.path.join(PROFILES_DIR, name)
        default_state = {
            "inbounds": [
                {
                    "tag": "mixed-10808",
                    "type": "mixed",
                    "port": 10808,
                    "detours": [],
                    "selectorDefault": None
                }
            ],
            "nodeLibrary": [
                { "id": "lib-direct", "tag": "direct", "type": "direct" }
            ],
            "layers": [
                {
                    "id": "layer-1",
                    "title": "HOP 1",
                    "nodes": []
                }
            ]
        }
        try:
            with open(path, 'w') as f:
                json.dump(default_state, f, indent=2)
            self.send_json({"status": "success"})
        except Exception as e:
            self.send_json({"status": "error", "message": str(e)})

    def handle_save_profile(self):
        data = self.get_json_body()
        raw = data.get('name')
        name = normalize_profile_name(raw)
        content = data.get('content')
        if not name or not content:
            self.send_json({"status": "error", "message": "Missing name or content"})
            return
        path = os.path.join(PROFILES_DIR, name)
        try:
            with open(path, 'w') as f:
                json.dump(content, f, indent=2)
            self.send_json({"status": "success"})
        except Exception as e:
             self.send_json({"status": "error", "message": str(e)})

    def handle_delete_profile(self):
        data = self.get_json_body()
        raw = data.get('name')
        name = normalize_profile_name(raw)
        if not name:
            self.send_json({"status": "error", "message": "Invalid or missing profile name"})
            return
        path = os.path.join(PROFILES_DIR, name)
        if os.path.exists(path):
            try:
                os.remove(path)
                self.send_json({"status": "success"})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)})
        else:
            self.send_json({"status": "error", "message": "File not found"})

    # --- Core Logic ---

    def handle_core_logs(self):
        log_path = os.path.join(os.path.dirname(__file__), 'sing-box.log')
        if os.path.exists(log_path):
            try:
                with open(log_path, 'r', encoding='utf-8', errors='replace') as f:
                    lines = f.readlines()
                    self.send_json({"logs": lines[-50:]})
            except Exception as e:
                self.send_json({"logs": [f"Error reading log: {str(e)}"]})
        else:
            self.send_json({"logs": ["Log file not found."]})

    def handle_start(self):
        global singbox_process
        print(">> handle_start triggered")

        rr_proxy_manager.stop_all()

        process_manager.kill_existing_processes()
        ensure_config_exists(CONFIG_PATH)

        if not os.path.exists(CONFIG_PATH):
            print(f"!! Config missing: {CONFIG_PATH}")
            self.send_json({"status": "error", "message": f"Config missing at {CONFIG_PATH}"})
            return

        print(f"Checking Binary at: {BIN_PATH}")
        if not os.path.exists(BIN_PATH):
             print(f"!! Binary missing")
             self.send_json({"status": "error", "message": f"Binary missing at {BIN_PATH}"})
             return

        ok, detail = run_singbox_check(CONFIG_PATH, BIN_PATH)
        if not ok:
            self.send_json({
                "status": "error",
                "message": "Config validation failed before start",
                "detail": detail
            })
            return

        try:
            rr_proxy_manager.start_from_config(CONFIG_PATH)
        except Exception as e:
            self.send_json({
                "status": "error",
                "message": f"Round-robin helper start failed: {e}"
            })
            return

        success, result = process_manager.start()
        if success:
            singbox_process = process_manager.process
            print(">> Process running stable")
            self.send_json({
                "status": "success",
                "pid": process_manager.process.pid,
                "detail": result
            })
        else:
            rr_proxy_manager.stop_all()
            self.send_json({
                "status": "error",
                "message": result
            })

    def handle_stop(self):
        global singbox_process
        success, message = process_manager.stop()
        if success:
            singbox_process = None
            rr_proxy_manager.stop_all()
        self.send_json({"status": "success" if success else "warning", "message": message})

    def handle_status(self):
        global singbox_process
        is_running = process_manager.is_running()
        self.send_json({"running": is_running})

    def handle_save_config(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        try:
            config_data = json.loads(post_data)
        except Exception as e:
            self.send_json({"status": "error", "message": f"Invalid JSON: {str(e)}"})
            return

        success, message, detail = save_config(config_data, CONFIG_PATH, BIN_PATH)
        self.send_json({
            "status": "success" if success else "error",
            "message": message,
            "detail": detail
        })


def run_server():
    os.chdir(WEB_DIR) # Serve static files from web directory
    # Allow address reuse to avoid "Address already in use" during restarts
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PORT), ProxyRequestHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        print(f"Core binary expected at: {BIN_PATH}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
            if singbox_process:
                singbox_process.terminate()


if __name__ == "__main__":
    print("Initializing Sing-Box Wrapper...")

    # Auto-install core if missing
    if not os.path.exists(BIN_PATH):
        print("Core binary not found, installing automatically...")
        try:
            install_sing_box_core(BASE_DIR)
        except Exception as e:
            print(f"ERROR: Failed to install sing-box core: {e}")
            print("Please check your internet connection and try again.")
            sys.exit(1)

    run_server()