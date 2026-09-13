#!/usr/bin/env python3
"""Generate the reviewed local GPT speech pack; never called by a normal build."""
import argparse
import array
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.error
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def key_for(args):
    key = os.environ.get('OPENAI_API_KEY')
    if args.env_file:
        for line in Path(args.env_file).read_text().splitlines():
            name, sep, value = line.removeprefix('export ').partition('=')
            if sep and name.strip() == 'OPENAI_API_KEY':
                key = value.strip().strip('\"\'')
    if args.keychain_service:
        command = ['security', 'find-generic-password', '-s', args.keychain_service]
        if args.keychain_account:
            command += ['-a', args.keychain_account]
        result = subprocess.run(command + ['-w'], capture_output=True, text=True)
        if result.returncode:
            raise SystemExit('The named Keychain item is unavailable.')
        key = result.stdout.strip()
    if not key:
        raise SystemExit('Set OPENAI_API_KEY or provide a local credential location.')
    return key

def stinger(style, path):
    rate = 24000
    duration = style['step'] * 3 + .85
    samples = array.array('h')
    for i in range(round(duration * rate)):
        t = i / rate
        sample = 0
        for n, frequency in enumerate(style['notes']):
            age = t - n * style['step']
            if 0 <= age < .85:
                envelope = min(1, age / .012) * math.exp(-age * 5) * min(1, (.85 - age) / .06)
                x = 2 * math.pi * frequency * age
                tone = math.sin(x)
                if style['wave'] == 'triangle':
                    tone = .9 * (math.sin(x) - math.sin(3*x)/9 + math.sin(5*x)/25)
                sample += tone * envelope * .09
        samples.append(round(max(-.95, min(.95, sample)) * 32767))
    if __import__('sys').byteorder != 'little':
        samples.byteswap()
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(rate)
        output.writeframes(samples.tobytes())

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--generate', action='store_true')
    parser.add_argument('--music-only', action='store_true')
    parser.add_argument('--env-file')
    parser.add_argument('--keychain-service')
    parser.add_argument('--keychain-account')
    args = parser.parse_args()
    pack = json.loads((ROOT/'resources/encouragement.json').read_text())
    output = ROOT/'public/audio/encouragement'
    receipt_path = output/'manifest.json'
    receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else {'clips': {}}
    styles = {s['id']: s for s in pack['styles']}
    print(f"Pack: {len(pack['clips'])} GPT speech clips, {len(styles)} original musical stingers", flush=True)
    if not args.generate and not args.music_only:
        print('Pass --generate to create missing resources. Existing matching resources are reused.')
        return
    output.mkdir(parents=True, exist_ok=True)
    receipt['music'] = {}
    for style in styles.values():
        target = output/('music-'+style['id']+'.wav'); stinger(style,target)
        receipt['music'][style['id']] = {'sha256':digest(target),'generator':'original additive synthesis'}
    receipt_path.write_text(json.dumps(receipt,indent=2)+'\n')
    if args.music_only:
        print('Six original musical stingers generated; no speech API called.',flush=True)
        return
    key = key_for(args)
    for clip in pack['clips']:
        style = styles[clip['style']]
        payload = {'model': pack['model'], 'voice': style['voice'], 'input': clip['text'],
                   'instructions': 'Speak only the supplied English line, naturally and clearly. No added words, music or sound effects. ' + style['direction'],
                   'response_format': 'mp3'}
        fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        target = output/(clip['id']+'.mp3')
        prior = receipt['clips'].get(clip['id'], {})
        if target.exists() and prior.get('requestSHA256') == fingerprint and prior.get('sha256') == digest(target):
            print('Reused', clip['id'], flush=True)
            continue
        request = urllib.request.Request('https://api.openai.com/v1/audio/speech',
                  data=json.dumps(payload).encode(), headers={'Authorization':'Bearer '+key, 'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                data = response.read(5*1024*1024+1)
        except urllib.error.HTTPError as error:
            raise SystemExit(f'Speech generation failed: HTTP {error.code}. No response or credential was logged.') from None
        if not data or len(data) > 5*1024*1024:
            raise SystemExit('Speech response size is outside the allowed range.')
        with tempfile.TemporaryDirectory(prefix='fitness-voice-') as tmp:
            raw = Path(tmp)/'speech.mp3'; normalized = Path(tmp)/'normalized.mp3'
            raw.write_bytes(data)
            subprocess.run(['ffmpeg','-v','error','-i',str(raw),'-af','loudnorm=I=-18:TP=-2:LRA=7',
                            '-ar','24000','-ac','1','-b:a','64k',str(normalized)],check=True)
            duration = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration',
                            '-of','default=noprint_wrappers=1:nokey=1',str(normalized)],text=True))
            if not .5 <= duration <= 9:
                raise SystemExit(f'{clip["id"]}: speech duration needs review ({duration:.2f}s).')
            target.write_bytes(normalized.read_bytes())
        receipt['clips'][clip['id']] = {'requestSHA256':fingerprint,'sha256':digest(target),
                    'model':pack['model'],'voice':style['voice'],'duration':round(duration,3),
                    'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        receipt_path.write_text(json.dumps(receipt,indent=2)+'\n')
        print('Generated',clip['id'],f'{duration:.2f}s',flush=True)
    print('Pack complete.',flush=True)

if __name__ == '__main__':
    main()
