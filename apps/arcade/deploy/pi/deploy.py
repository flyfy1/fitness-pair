#!/usr/bin/env python3
"""Deploy clean pushed main, or move an existing GCE release without rebuilding it."""
import argparse
import datetime
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile

root = Path(__file__).resolve().parents[4]
def run(args, **kwargs):
    return subprocess.run(args, cwd=root, check=True, **kwargs)
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--from-gce', action='store_true', help='Copy the currently served GCE application and all client bytes; only add the Pi deployment adapter.')
args = parser.parse_args()
if git('branch', '--show-current') != 'main' or git('status', '--porcelain'):
    raise SystemExit('Deploy from clean, committed main.')
commit = git('rev-parse', 'HEAD')
if commit != git('ls-remote', 'origin', 'refs/heads/main').split()[0]:
    raise SystemExit('Push main before deployment.')
if subprocess.check_output(['ssh','pi','hostname'],text=True).strip() != 'songyy-pi':
    raise SystemExit('Unexpected target host.')
local = root / '.local/pi-deploy'
local.mkdir(parents=True, exist_ok=True)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
release = f'{stamp}-pi-{commit[:12]}'
archive = local / f'fitness-arcade-{release}.tar.gz'
source = local / 'source.tar.gz'
if args.from_gce:
    with source.open('wb') as output:
        run(['ssh','integ-prod','sudo -n tar -czf - -C /opt/fitness-arcade/current .'],stdout=output)
else:
    run(['npm','run','build:arcade'],env={**os.environ,'VITE_SITE_URL':'https://fitness.integ.life'})
    run(['git','archive','--format=tar.gz','--output='+str(source),'HEAD'])
with tarfile.open(source,'r:gz') as original, tarfile.open(archive,'w:gz') as bundle:
    manifest = {'commit':commit,'origin':'https://fitness.integ.life'}
    for member in original:
        name = member.name.removeprefix('./')
        if name == 'release.json':
            manifest = json.load(original.extractfile(member))
            continue
        if name.startswith('apps/arcade/deploy/pi/'):
            continue
        bundle.addfile(member,original.extractfile(member) if member.isfile() else None)
    if not args.from_gce:
        bundle.add(root/'dist/client',arcname='client')
    bundle.add(root/'apps/arcade/deploy/pi',arcname='apps/arcade/deploy/pi',filter=lambda m: None if '__pycache__' in m.name else m)
    manifest = {**manifest,'sourceRelease':manifest.get('release'),'release':release,'deploymentCommit':commit,'host':'songyy-pi'}
    data = (json.dumps(manifest)+'\n').encode()
    entry = tarfile.TarInfo('release.json');entry.size=len(data);entry.mode=0o644
    bundle.addfile(entry,io.BytesIO(data))
if git('rev-parse','HEAD') != commit or git('status','--porcelain'):
    raise SystemExit('Source changed while packaging; no deployment performed.')
run(['scp',str(archive),'pi:/tmp/'+archive.name])
run(['scp',str(root/'apps/arcade/deploy/pi/install.sh'),'pi:/tmp/fitness-arcade-install.sh'])
run(['ssh','pi','sudo -n sh /tmp/fitness-arcade-install.sh '+release])
print('\nPi installed:',release)
print('Verify gallery identity, state, browser behavior and Cloudflare routing before declaring migration complete.')
