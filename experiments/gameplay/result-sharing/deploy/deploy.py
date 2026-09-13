#!/usr/bin/env python3
"""Deploy only a clean, committed sharing experiment to the explicitly named GCP VM."""
import datetime, os, pathlib, secrets, subprocess
root = pathlib.Path(__file__).resolve().parents[4]
experiment = pathlib.Path(__file__).resolve().parents[1]
prefix = str(experiment.relative_to(root))
def run(args, **kw): return subprocess.run(args, check=True, **kw)
if subprocess.check_output(['git','status','--porcelain'], cwd=root).strip():
    raise SystemExit('Deploy from a clean worktree.')
commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
release = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+commit[:12]
local = experiment/'.local'
local.mkdir(mode=0o700,exist_ok=True)
code = local/'upload-code.txt'
if not code.exists():
    code.write_text(secrets.token_urlsafe(24)+'\n'); code.chmod(0o600)
env = local/'upload.env'; env.write_text('UPLOAD_CODE='+code.read_text().strip()+'\n');env.chmod(0o600)
archive = local/f'fitness-sharing-{release}.tar'
run(['git','archive','--format=tar','-o',str(archive),commit,prefix],cwd=root)
flags=['--project','project-e8ef2daf-0520-4018-b9f','--zone','asia-southeast1-b','--tunnel-through-iap']
run(['gcloud','compute','scp',str(archive),f'integ-prod:/tmp/{archive.name}',*flags])
run(['gcloud','compute','scp',str(env),'integ-prod:/tmp/fitness-sharing-upload.env',*flags])
run(['gcloud','compute','scp',str(experiment/'deploy/install.sh'),'integ-prod:/tmp/fitness-sharing-install.sh',*flags])
run(['gcloud','compute','ssh','integ-prod',*flags,'--command',f'sudo -n sh /tmp/fitness-sharing-install.sh {release}'])
print('Deployed release:',release)
print('Private upload code is in',code,'(never include it in public links).')
