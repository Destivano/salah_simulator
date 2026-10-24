"""Build a dependency-free Lambda ZIP with an explicit file allowlist."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parent.parent
output = root / 'dist' / 'salah-simulator-lambda.zip'
output.parent.mkdir(exist_ok=True)
files = [root / 'lambda.mjs', root / 'qa-service.mjs']
files += sorted(p for p in (root / 'docs').rglob('*') if p.is_file() and not p.is_symlink()
                and p.suffix.lower() in {'.txt', '.md'} and not any(part.startswith('.') for part in p.relative_to(root).parts))
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        info = zipfile.ZipInfo(file.relative_to(root).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, file.read_bytes())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert {'lambda.mjs', 'qa-service.mjs', 'docs/rules.txt'} <= set(archive.namelist())
    assert not any('.env' in name or '\\' in name for name in archive.namelist())
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n', encoding='ascii')
print(f'{output}\n{output.stat().st_size} bytes\nSHA256 {digest}')
