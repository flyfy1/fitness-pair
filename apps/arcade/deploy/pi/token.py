"""Private child-process protocol. Never invoke directly in a terminal/log."""
import datetime
import json
import sys
import google.auth
from google.auth.transport.requests import Request

try:
    credentials, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/devstorage.read_write'])
    credentials.refresh(Request())
    expiry = credentials.expiry.replace(tzinfo=datetime.timezone.utc).isoformat()
    sys.stdout.write(json.dumps({'token': credentials.token, 'expiry': expiry}))
except Exception:
    sys.stderr.write('Gallery authentication is unavailable.\n')
    sys.exit(1)
