#!/usr/bin/env python3
"""Produce a reviewed, secret-free source bundle; the hash identifies uncommitted code too."""
import hashlib,io,json,os,pathlib,subprocess,tarfile
root=pathlib.Path(__file__).resolve().parents[1]
os.chdir(root)
files=[pathlib.Path(p) for p in ['Dockerfile','.dockerignore','package.json','package-lock.json']]
for directory in ['server','deploy','scripts','test']:
 files.extend(p for p in pathlib.Path(directory).rglob('*') if p.is_file() and p.suffix not in ('.log','.db','.zip'))
files.extend(pathlib.Path('web')/p for p in ['index.html','app.js','api-client.js','crypto.js','theme.js','sw.js','manifest.webmanifest'])
files.extend(p for p in pathlib.Path('web/icons').rglob('*') if p.is_file())
files.append(pathlib.Path('playwright.config.js'))
manifest={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(files))}
revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
metadata=json.dumps({'git_base':revision,'files':manifest},sort_keys=True,indent=2).encode()
release=hashlib.sha256(metadata).hexdigest()[:20]
out=root/'artifacts';out.mkdir(exist_ok=True)
with tarfile.open(out/f'{release}.tar.gz','w:gz') as tar:
 for p in sorted(set(files)):
  info=tar.gettarinfo(str(p));info.uid=info.gid=0;info.uname=info.gname='';info.mtime=0
  with p.open('rb') as source:tar.addfile(info,source)
 info=tarfile.TarInfo('release-manifest.json');info.size=len(metadata);info.mode=0o644;info.mtime=0
 tar.addfile(info,io.BytesIO(metadata))
(out/f'{release}.manifest.json').write_bytes(metadata)
print(release)
