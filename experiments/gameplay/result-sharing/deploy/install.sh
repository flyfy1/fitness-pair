#!/bin/sh
set -eu
release="$1"
case "$release" in *[!a-zA-Z0-9-]*|'') exit 2;; esac
base=/opt/fitness-sharing
archive="/tmp/fitness-sharing-$release.tar"
# A dedicated proxy must not replace another listener or restart the legacy Caddy.
if ! systemctl is-active --quiet fitness-sharing-proxy.service; then
  if ss -lntH '( sport = :80 or sport = :443 )' | grep -q .; then
    echo 'Ports 80/443 are owned by another process; deployment stopped.' >&2
    exit 1
  fi
fi
command -v node >/dev/null
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
id fitness-sharing >/dev/null 2>&1 || useradd --system --home /var/lib/fitness-sharing --shell /usr/sbin/nologin fitness-sharing
install -d -m 0755 "$base/releases/$release"
tar -xf "$archive" --strip-components=3 -C "$base/releases/$release"
/usr/bin/caddy validate --config "$base/releases/$release/deploy/Caddyfile" --adapter caddyfile
previous=$(readlink "$base/current" || true)
install -d -m 0700 "$base/rollback/$release"
for config in /etc/fitness-sharing.env /etc/fitness-sharing.Caddyfile /etc/systemd/system/fitness-sharing.service /etc/systemd/system/fitness-sharing-proxy.service; do
  if test -f "$config"; then cp -p "$config" "$base/rollback/$release/$(basename "$config")"; fi
done
printf '%s\n' "$previous" > "$base/rollback/$release/previous-release"
if test -n "$previous"; then
  systemctl stop fitness-sharing.service
  tar -cf "$base/rollback/$release/data.tar" -C /var/lib fitness-sharing
fi
rollback() {
  echo 'Release failed; restoring the previous service configuration.' >&2
  systemctl stop fitness-sharing.service fitness-sharing-proxy.service || true
  if test -n "$previous"; then
    ln -sfn "$previous" "$base/current"
    cp -p "$base/rollback/$release/fitness-sharing.env" /etc/fitness-sharing.env
    cp -p "$base/rollback/$release/fitness-sharing.Caddyfile" /etc/fitness-sharing.Caddyfile
    cp -p "$base/rollback/$release/fitness-sharing.service" /etc/systemd/system/fitness-sharing.service
    cp -p "$base/rollback/$release/fitness-sharing-proxy.service" /etc/systemd/system/fitness-sharing-proxy.service
    systemctl daemon-reload
    systemctl start fitness-sharing.service fitness-sharing-proxy.service
  fi
}
trap rollback EXIT
if test ! -f /etc/fitness-sharing.env; then install -m 0600 /tmp/fitness-sharing-upload.env /etc/fitness-sharing.env; fi
# Keep the existing uploader code on subsequent deployments.
sed -i '/^RELEASE=/d' /etc/fitness-sharing.env
printf 'RELEASE=%s\n' "$release" >> /etc/fitness-sharing.env
install -m 0644 "$base/releases/$release/deploy/fitness-sharing.service" /etc/systemd/system/fitness-sharing.service
install -m 0644 "$base/releases/$release/deploy/fitness-sharing-proxy.service" /etc/systemd/system/fitness-sharing-proxy.service
install -m 0644 "$base/releases/$release/deploy/Caddyfile" /etc/fitness-sharing.Caddyfile
ln -sfn "$base/releases/$release" "$base/current"
systemctl daemon-reload
systemctl enable fitness-sharing.service
systemctl restart fitness-sharing.service
curl --fail --silent --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 http://127.0.0.1:8410/healthz
systemctl enable fitness-sharing-proxy.service
systemctl restart fitness-sharing-proxy.service
systemctl is-active --quiet fitness-sharing.service fitness-sharing-proxy.service
rm -f /tmp/fitness-sharing-upload.env "$archive"
trap - EXIT
