import os
import platform
import subprocess
import sys
import time


class SingBoxProcessManager:
    """Manages sing-box process lifecycle"""

    def __init__(self, bin_path, config_path):
        self.bin_path = bin_path
        self.config_path = config_path
        self.process = None
        self.system_os = platform.system()
        self.bin_name = "sing-box.exe" if self.system_os == "Windows" else "sing-box"

    def kill_existing_processes(self):
        """Clean up existing sing-box processes"""
        print("Cleaning up existing sing-box processes...")
        try:
            if self.system_os == "Windows":
                subprocess.run(["taskkill", "/F", "/IM", self.bin_name, "/T"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                subprocess.run(["pkill", "-9", "-f", self.bin_name],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            print(f"Warning during cleanup: {e}")

    def start(self):
        """Start sing-box process"""
        if not os.path.exists(self.bin_path):
            return False, f"Binary missing at {self.bin_path}"

        if not os.path.exists(self.config_path):
            return False, f"Config missing at {self.config_path}"

        # Ensure binary is executable on Unix systems
        if self.system_os != 'Windows':
            try:
                st = os.stat(self.bin_path)
                os.chmod(self.bin_path, st.st_mode | 0o111)
            except Exception as e:
                print(f"Warning: Failed to chmod {self.bin_path}: {e}")

        try:
            startupinfo = None
            if self.system_os == 'Windows':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

            cmd = [self.bin_path, "run", "-c", self.config_path]
            print(f"Executing: {' '.join(cmd)}")

            log_file_path = os.path.join(os.path.dirname(self.config_path), '..', 'sing-box.log')
            print(f"Logging to: {log_file_path}")
            # Truncate log on each start to avoid stale errors polluting UI
            log_file = open(log_file_path, 'w', encoding='utf-8')

            env = self._get_env()

            self.process = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
                startupinfo=startupinfo,
                env=env
            )
            print(f"Process started with PID: {self.process.pid}")

            # Check if process is still alive after a short delay
            time.sleep(0.5)
            if self.process.poll() is not None:
                self.process = None
                return False, "Core exited immediately. Check logs."

            return True, f"Process started with PID {self.process.pid}"

        except Exception as e:
            self.process = None
            return False, str(e)

    def stop(self):
        """Stop sing-box process"""
        if self.process:
            self.process.terminate()
            self.process = None
            return True, "Stopped"
        return False, "Not running"

    def is_running(self):
        """Check if process is running"""
        return self.process is not None and self.process.poll() is None

    def _get_env(self):
        """Get environment variables for sing-box"""
        env = os.environ.copy()
        env['ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS'] = 'true'
        return env