import os
from pathlib import Path
import subprocess
import sys
import tempfile
import venv


def main():
    if sys.argv[1:]:
        raise ValueError("privacy parser setup takes no arguments")
    release_root = Path(__file__).resolve().parent
    environment = release_root.parents[1] / ".cache" / "privacy-parser"
    venv.create(environment, with_pip=True)
    interpreter = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python3")
    with tempfile.TemporaryDirectory(prefix="install-", dir=environment) as home:
        subprocess.run(
            [str(interpreter), "-I", "-m", "pip", "--isolated", "install", "--disable-pip-version-check",
             "--no-cache-dir", "--keyring-provider", "disabled", "--no-deps", "--only-binary=:all:",
             "--require-hashes", "--no-index", "-r", str(release_root / "privacy-parser-requirements.txt")],
            env={"PATH": os.defpath, "HOME": home, "USERPROFILE": home, "APPDATA": home,
                 "LOCALAPPDATA": home, "PIP_CONFIG_FILE": os.devnull,
                 **({"SYSTEMROOT": os.environ["SYSTEMROOT"]} if "SYSTEMROOT" in os.environ else {})},
            check=True,
            timeout=120,
        )


if __name__ == "__main__":
    main()
