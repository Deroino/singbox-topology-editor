import json
import os
import subprocess
import tempfile
import shutil


def get_singbox_env():
    """Get environment variables for sing-box"""
    env = os.environ.copy()
    env['ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS'] = 'true'
    return env


def run_singbox_check(config_path, bin_path):
    """Validate sing-box configuration"""
    if not os.path.exists(bin_path):
        return False, f"Binary missing at {bin_path}"
    cmd = [bin_path, "check", "-c", config_path, "--disable-color"]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=get_singbox_env()
        )
        output = (result.stdout or "") + (result.stderr or "")
        output = output.strip()
        if result.returncode == 0:
            return True, output or "sing-box check passed"
        return False, output or "sing-box check failed"
    except Exception as e:
        return False, str(e)


def ensure_config_exists(config_path):
    """Create default config if it doesn't exist"""
    if not os.path.exists(config_path):
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        default_config = {
            "log": { "level": "info", "timestamp": True },
            "inbounds": [{
                "type": "mixed",
                "tag": "mixed-in",
                "listen": "127.0.0.1",
                "listen_port": 10808,
                "sniff": True
            }],
            "outbounds": [{ "type": "direct", "tag": "direct" }],
            "route": {
                "rules": [
                    { "protocol": "dns", "action": "hijack-dns" }
                ]
            }
        }

        with open(config_path, 'w') as f:
            json.dump(default_config, f, indent=2)


def ensure_profiles_dir(profiles_dir):
    """Create profiles directory and default profile if needed"""
    if not os.path.exists(profiles_dir):
        os.makedirs(profiles_dir)
        default_path = os.path.join(profiles_dir, 'Default.json')
        if not os.path.exists(default_path):
            with open(default_path, 'w') as f:
                json.dump({
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
                }, f, indent=2)


def save_config(config_data, config_path, bin_path):
    """Save configuration with validation"""
    try:
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(prefix="config-", suffix=".json", dir=os.path.dirname(config_path))
        with os.fdopen(fd, 'w') as tmp:
            json.dump(config_data, tmp, indent=2)

        ok, detail = run_singbox_check(tmp_path, bin_path)
        if not ok:
            os.unlink(tmp_path)
            return False, "Config validation failed", detail

        shutil.move(tmp_path, config_path)
        return True, "Config saved", detail
    except Exception as e:
        return False, str(e), None


def normalize_profile_name(name):
    """Normalize and validate profile name"""
    if not name:
        return None
    if not name.endswith(".json"):
        name += ".json"
    # Disallow traversal or path separators
    if name != os.path.basename(name):
        return None
    if ".." in name:
        return None
    return name