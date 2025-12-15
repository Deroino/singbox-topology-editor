import os
import platform
import shutil
import urllib.request
import zipfile
import tarfile

# Sing-box installation constants
DEFAULT_VERSION = "1.12.12"
ARCH = "amd64"
BASE_URL = "https://github.com/SagerNet/sing-box/releases/download"
DOWNLOAD_MAP = {
    "Windows": {"ext": "zip", "bin_name": "sing-box.exe", "os": "windows"},
    "Linux": {"ext": "tar.gz", "bin_name": "sing-box", "os": "linux"},
    "Darwin": {"ext": "tar.gz", "bin_name": "sing-box", "os": "darwin"},
}


def _check_path_traversal(base_dir, target_path):
    """Check if target path is within base directory to prevent path traversal"""
    base_dir = os.path.abspath(base_dir)
    target_path = os.path.abspath(target_path)
    return os.path.commonpath([base_dir, target_path]) == base_dir


def _extract_zip_safe(zip_ref, dest_dir):
    """Safely extract zip file, preventing path traversal attacks"""
    for info in zip_ref.infolist():
        out_path = os.path.join(dest_dir, info.filename)
        if not _check_path_traversal(dest_dir, out_path):
            raise RuntimeError(f"Blocked zip path traversal: {info.filename}")
    zip_ref.extractall(dest_dir)


def _extract_tar_safe(tar_ref, dest_dir):
    """Safely extract tar file, preventing symlink attacks"""
    for member in tar_ref.getmembers():
        if member.issym() or member.islnk():
            raise RuntimeError(f"Blocked tar link entry: {member.name}")
        out_path = os.path.join(dest_dir, member.name)
        if not _check_path_traversal(dest_dir, out_path):
            raise RuntimeError(f"Blocked tar path traversal: {member.name}")
    tar_ref.extractall(dest_dir)


def _download_sing_box(url, dest):
    """Download sing-box archive from GitHub"""
    print(f"Downloading sing-box from {url}...")
    try:
        # Adding User-Agent because some GitHub releases might reject generic python requests
        req = urllib.request.Request(
            url,
            data=None,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
            }
        )
        with urllib.request.urlopen(req) as response, open(dest, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)
        print("Download complete.")
    except Exception as e:
        raise RuntimeError(f"Download failed: {e}")


def _install_from_archive(archive_path, config, bin_dir, temp_dir):
    """Extract and install sing-box from archive"""
    print(f"Extracting {config['ext']} archive...")

    target_bin_name = config['bin_name']  # e.g. sing-box or sing-box.exe
    extracted_bin_path = None

    try:
        if config['ext'] == 'zip':
            with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                _extract_zip_safe(zip_ref, temp_dir)
                # Search for the binary
                for root, dirs, files in os.walk(temp_dir):
                    if target_bin_name in files:
                        extracted_bin_path = os.path.join(root, target_bin_name)
                        break

        elif config['ext'] == 'tar.gz':
            with tarfile.open(archive_path, 'r:gz') as tar_ref:
                _extract_tar_safe(tar_ref, temp_dir)
                # Search for the binary
                for root, dirs, files in os.walk(temp_dir):
                    if target_bin_name in files:
                        extracted_bin_path = os.path.join(root, target_bin_name)
                        break

        if not extracted_bin_path:
            raise RuntimeError(f"Could not find '{target_bin_name}' in the archive.")

        # Prepare destination
        final_path = os.path.join(bin_dir, target_bin_name)

        # Remove old version if exists
        if os.path.exists(final_path):
            os.remove(final_path)

        # Move to bin
        shutil.move(extracted_bin_path, final_path)

        # chmod +x for Linux/Mac
        if platform.system() != "Windows":
            os.chmod(final_path, 0o755)

        print(f"Installed {target_bin_name} to {bin_dir}/")

    except Exception as e:
        raise RuntimeError(f"Installation failed: {e}")


def install_sing_box_core(base_dir):
    """Main function to install sing-box core"""
    temp_dir = os.path.join(base_dir, 'temp')
    bin_dir = os.path.join(base_dir, 'bin')

    # Ensure directories exist
    os.makedirs(bin_dir, exist_ok=True)
    os.makedirs(temp_dir, exist_ok=True)

    # Get system configuration
    system = platform.system()
    if system not in DOWNLOAD_MAP:
        raise RuntimeError(f"Unsupported operating system: {system}")

    cfg = DOWNLOAD_MAP[system].copy()
    version = DEFAULT_VERSION
    cfg["url"] = f"{BASE_URL}/v{version}/sing-box-{version}-{cfg['os']}-{ARCH}.{cfg['ext']}"

    # Download and install
    archive_path = os.path.join(temp_dir, f"sing-box.{cfg['ext']}")
    _download_sing_box(cfg["url"], archive_path)
    _install_from_archive(archive_path, cfg, bin_dir, temp_dir)

    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)

    print(f"Successfully installed sing-box {version}")