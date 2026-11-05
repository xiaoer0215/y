"""Export the current customized source, including untracked code, for a Mac build."""
import argparse
import hashlib
import json
import stat
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = (
    "src",
    "src-tauri/src",
    "src-tauri/icons",
    "src-tauri/capabilities",
    "src-tauri/permissions",
    "src-tauri/wix",
    "scripts",
)
FILES = (
    "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".node-version",
    "rust-toolchain.toml", "vite.config.ts", "tsconfig.json", "tsconfig.node.json",
    "tailwind.config.cjs", "postcss.config.cjs", "components.json",
    "LICENSE", "THIRD_PARTY_NOTICES.md", "DESKTOP-FEATURES.md", "UOCODE.md",
    "MACOS-TEST.md", "Build-Mac-Test.command", ".gitignore", ".gitattributes",
    ".github/workflows/macos-test.yml",
)
TEXT_SUFFIXES = {
    ".rs", ".toml", ".json", ".yaml", ".yml", ".ts", ".tsx", ".js", ".jsx",
    ".mjs", ".cjs", ".css", ".html", ".md", ".txt", ".sh", ".command", ".py",
    ".ps1", ".xml", ".plist", ".manifest", ".wxs", ".wxi", ".svg",
}
EXCLUDED_PARTS = {"__pycache__", "node_modules", "target", "output", ".git", "dist"}


def source_files():
    files = {ROOT / name for name in FILES if (ROOT / name).is_file()}
    for directory in DIRECTORIES:
        root = ROOT / directory
        if root.is_dir():
            files.update(path for path in root.rglob("*") if path.is_file())
    files.update(path for path in (ROOT / "src-tauri").iterdir() if path.is_file() and path.suffix in {".toml", ".lock", ".rs", ".json", ".manifest", ".plist"})
    for path in sorted(files):
        relative = path.relative_to(ROOT)
        if EXCLUDED_PARTS.intersection(relative.parts) or path.name.startswith(".env"):
            continue
        if path.is_symlink() or not path.resolve().is_relative_to(ROOT.resolve()):
            raise ValueError(f"Source path leaves the project: {relative}")
        if path.suffix in {".key", ".pem", ".p12", ".pfx", ".pyc", ".log"}:
            continue
        yield path, relative.as_posix()


def write_entry(archive, name, data):
    entry = ZipInfo("AI-Helper-macOS-test/" + name)
    entry.create_system = 3
    executable = name.endswith((".sh", ".command"))
    entry.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
    entry.compress_type = ZIP_DEFLATED
    archive.writestr(entry, data)


def main():
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / f"output/macos-test/AI-Helper-{version}-macOS-build-kit.zip")
    output = parser.parse_args().output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = {"app_version": version, "default_target": "universal-apple-darwin", "created_utc": datetime.now(timezone.utc).isoformat(), "files": []}
    with ZipFile(output, "w") as archive:
        for path, name in source_files():
            data = path.read_bytes()
            if path.suffix in TEXT_SUFFIXES:
                data = data.replace(b"\r\n", b"\n")
            manifest["files"].append({"path": name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
            write_entry(archive, name, data)
        write_entry(archive, "source-manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"))
    checksum = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + ".sha256").write_text(f"{checksum}  {output.name}\n", encoding="utf-8")
    print(f"Source build kit: {output}")
    print(f"Files: {len(manifest['files'])}; bytes: {output.stat().st_size}")
    print(f"SHA256: {checksum}")
    print("This is a source build kit, not a compiled DMG. Run Build-Mac-Test.command on macOS to build it.")


if __name__ == "__main__":
    main()
