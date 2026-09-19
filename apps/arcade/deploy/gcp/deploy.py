#!/usr/bin/env python3
"""Build committed main for GCP without publishing or changing the GPT Sites deployment."""
import datetime
import json
import os
import pathlib
import subprocess
import tarfile

root = pathlib.Path(__file__).resolve().parents[4]
def run(args, **kwargs):
    return subprocess.run(args, cwd=root, check=True, **kwargs)
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()

if git('branch', '--show-current') != 'main' or git('status', '--porcelain'):
    raise SystemExit('Deploy from clean, committed main.')
commit = git('rev-parse', 'HEAD')
remote = git('ls-remote', 'origin', 'refs/heads/main').split()[0]
if commit != remote:
    raise SystemExit('Push main and verify its remote commit before deploying.')
release = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+commit[:12]
environment = {**os.environ, 'VITE_SITE_URL': 'https://fitness.integ.life'}
run(['npm', 'run', 'build:arcade'], env=environment)
local = root/'.local/gcp-deploy'
local.mkdir(parents=True, exist_ok=True)
manifest = local/'release.json'
manifest.write_text(json.dumps({'release': release, 'commit': commit, 'origin': environment['VITE_SITE_URL']})+'\n')
archive = local/f'fitness-arcade-{release}.tar.gz'
with tarfile.open(archive, 'w:gz') as bundle:
    bundle.add(root/'dist/client', arcname='client')
    bundle.add(manifest, arcname='release.json')
    for name in ['apps/arcade/deploy/gcp/gateway.mjs', 'apps/arcade/deploy/gcp/backfill-thumbnails.mjs', 'apps/arcade/deploy/gcp/identity.mjs', 'apps/arcade/deploy/gcp/auth.mjs', 'apps/arcade/deploy/gcp/feedback.mjs',
                 'apps/arcade/deploy/gcp/play-stats.mjs', 'apps/arcade/deploy/gcp/debug-reports.mjs', 'contracts/index.js',
                 'apps/arcade/deploy/gcp/account-store.mjs', 'apps/arcade/deploy/gcp/Caddyfile',
                 'apps/arcade/deploy/gcp/fitness-arcade.service', 'apps/arcade/server/worker.js', 'apps/arcade/game-catalog.js']:
        bundle.add(root/name, arcname=name)
    package = local/'package.json'
    package.write_text('{"type":"module"}\n')
    bundle.add(package, arcname='package.json')
if git('rev-parse', 'HEAD') != commit or git('status', '--porcelain'):
    raise SystemExit('Source changed during build; no remote deployment performed.')
# Migrate storage expiry before exposing choices beyond seven days.
run(['node', 'apps/arcade/deploy/gcp/retention-policy.mjs', '--apply',
     '--backup='+str(local/('retention-before-'+release))])
flags = ['--project', 'project-e8ef2daf-0520-4018-b9f', '--zone', 'asia-southeast1-b', '--tunnel-through-iap', '--quiet']
run(['gcloud', 'compute', 'scp', str(archive), f'integ-prod:/tmp/{archive.name}', *flags])
run(['gcloud', 'compute', 'scp', str(root/'apps/arcade/deploy/gcp/install.sh'), 'integ-prod:/tmp/fitness-arcade-install.sh', *flags])
run(['gcloud', 'compute', 'ssh', 'integ-prod', *flags, '--command', f'sudo -n sh /tmp/fitness-arcade-install.sh {release}'])
# Catch uploads that completed on the previous gateway during the release.
run(['node', 'apps/arcade/deploy/gcp/retention-policy.mjs', '--apply',
     '--backup='+str(local/('retention-after-'+release))])
print('GCP deployed:', release)
print('URL: https://fitness.integ.life')
