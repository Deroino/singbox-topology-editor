import os
import urllib.request
import zipfile
import tarfile
import shutil
import sys
import platform
import argparse

DEFAULT_VERSION = "1.12.12"
ARCH = "amd64"
BASE_URL = "https://github.com/SagerNet/sing-box/releases/download"

# Map OS -> archive type and binary name inside archive
DOWNLOAD_MAP = {
    "Windows": {"ext": "zip", "bin_name": "sing-box.exe", "os": "windows"},
    "Linux": {"ext": "tar.gz", "bin_name": "sing-box", "os": "linux"},
    "Darwin": {"ext": "tar.gz", "bin_name": "sing-box", "os": "darwin"},
}

TEMP_DIR = "temp"
BIN_DIR = "bin"

def _is_within_dir(base_dir, target_path):
    base_dir = os.path.abspath(base_dir)
    target_path = os.path.abspath(target_path)
    return os.path.commonpath([base_dir, target_path]) == base_dir

def safe_extract_zip(zip_ref, dest_dir):
    for info in zip_ref.infolist():
        out_path = os.path.join(dest_dir, info.filename)
        if not _is_within_dir(dest_dir, out_path):
            raise RuntimeError(f"Blocked zip path traversal: {info.filename}")
    zip_ref.extractall(dest_dir)

def safe_extract_tar(tar_ref, dest_dir):
    for member in tar_ref.getmembers():
        if member.issym() or member.islnk():
            raise RuntimeError(f"Blocked tar link entry: {member.name}")
        out_path = os.path.join(dest_dir, member.name)
        if not _is_within_dir(dest_dir, out_path):
            raise RuntimeError(f"Blocked tar path traversal: {member.name}")
    tar_ref.extractall(dest_dir)

def build_download_url(system, version):
    cfg = DOWNLOAD_MAP[system]
    asset = f"sing-box-{version}-{cfg['os']}-{ARCH}.{cfg['ext']}"
    return f"{BASE_URL}/v{version}/{asset}"

def get_system_config(version):
    system = platform.system()
    if system not in DOWNLOAD_MAP:
        print(f"Error: Unsupported operating system: {system}")
        sys.exit(1)
    cfg = DOWNLOAD_MAP[system].copy()
    cfg["url"] = build_download_url(system, version)
    return system, cfg

def download_file(url, dest):
    print(f"Downloading from {url}...")
    try:
        # Adding User-Agent because some GitHub releases might reject generic python requests
        req = urllib.request.Request(
            url, 
            data=None, 
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'}
        )
        with urllib.request.urlopen(req) as response, open(dest, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)
        print("Download complete.")
    except Exception as e:
        print(f"Download failed: {e}")
        sys.exit(1)

def extract_and_install(archive_path, config):
    print(f"Extracting {config['ext']} archive...")
    
    target_bin_name = config['bin_name'] # e.g. sing-box or sing-box.exe
    extracted_bin_path = None

    try:
        if config['ext'] == 'zip':
            with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                safe_extract_zip(zip_ref, TEMP_DIR)
                # Search for the binary
                for root, dirs, files in os.walk(TEMP_DIR):
                    if target_bin_name in files:
                        extracted_bin_path = os.path.join(root, target_bin_name)
                        break
                        
        elif config['ext'] == 'tar.gz':
            with tarfile.open(archive_path, 'r:gz') as tar_ref:
                safe_extract_tar(tar_ref, TEMP_DIR)
                # Search for the binary
                for root, dirs, files in os.walk(TEMP_DIR):
                    if target_bin_name in files:
                        extracted_bin_path = os.path.join(root, target_bin_name)
                        break
        
        if not extracted_bin_path:
            print(f"Error: Could not find '{target_bin_name}' in the archive.")
            sys.exit(1)

        # Prepare destination
        final_path = os.path.join(BIN_DIR, target_bin_name)
        
        # Remove old version if exists
        if os.path.exists(final_path):
            os.remove(final_path)

        # Move to bin
        shutil.move(extracted_bin_path, final_path)
        
        # chmod +x for Linux/Mac
        if platform.system() != "Windows":
            os.chmod(final_path, 0o755)
            
        print(f"Installed {target_bin_name} to {BIN_DIR}/")

    except Exception as e:
        print(f"Installation failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

def cleanup():
    print("Cleaning up temp files...")
    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR)
    os.makedirs(TEMP_DIR, exist_ok=True)

def main():
    parser = argparse.ArgumentParser(description="Download and install sing-box core")
    parser.add_argument("--version", default=DEFAULT_VERSION, help="sing-box version, e.g. 1.12.12")
    args = parser.parse_args()

    if not os.path.exists(BIN_DIR):
        os.makedirs(BIN_DIR)
    if not os.path.exists(TEMP_DIR):
        os.makedirs(TEMP_DIR)

    system_name, config = get_system_config(args.version)
    print(f"Detected System: {system_name}")
    
    if not config['url']:
         print("No download URL configured for this OS.")
         sys.exit(1)

    filename = f"sing-box.{config['ext']}"
    archive_dest = os.path.join(TEMP_DIR, filename)

    download_file(config['url'], archive_dest)
    extract_and_install(archive_dest, config)
    cleanup()
    print("SUCCESS: Sing-box core is ready.")

if __name__ == "__main__":
    main()
