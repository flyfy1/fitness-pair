#!/bin/sh
# Install code only. Initial state/identity and DNS cutover are separate steps.
set -eu
test "$(hostname)" = songyy-pi
test "$(uname -m)" = aarch64
release="$1"
case "$release" in *[!a-zA-Z0-9-]*|'') exit 2;; esac
base=/opt/fitness-arcade
target="$base/releases/$release"
backup="$base/rollback/$release"
test -x "$base/node/bin/node"
test -x "$base/auth-venv/bin/python"
test -f /etc/fitness-arcade/gcs-wif.json
test -f /etc/fitness-arcade.env
test ! -e "$target"
install -d -m 0755 "$target"
tar -xzf "/tmp/fitness-arcade-$release.tar.gz" -C "$target"
test -f "$target/client/index.html"
test -f "$target/client/runtime/pose_landmarker_lite.task"
test -f "$target/release.json"
/usr/bin/caddy validate --config "$target/apps/arcade/deploy/pi/Caddyfile" --adapter caddyfile
previous=$(readlink "$base/current" || true)
install -d -m 0700 "$backup"
printf '%s\n' "$previous" > "$backup/previous-release"
for file in /etc/fitness-arcade.Caddyfile /etc/systemd/system/fitness-arcade.service /etc/systemd/system/fitness-arcade-proxy.service; do
    if test -f "$file"; then cp -p "$file" "$backup/"; fi
done
rollback() {
    systemctl stop fitness-arcade.service fitness-arcade-proxy.service || true
    if test -n "$previous"; then
        ln -sfn "$previous" "$base/current"
        cp -p "$backup/fitness-arcade.Caddyfile" /etc/fitness-arcade.Caddyfile
        cp -p "$backup/fitness-arcade.service" /etc/systemd/system/fitness-arcade.service
        cp -p "$backup/fitness-arcade-proxy.service" /etc/systemd/system/fitness-arcade-proxy.service
        systemctl daemon-reload
        systemctl start fitness-arcade.service fitness-arcade-proxy.service
    fi
}
trap rollback EXIT
systemctl stop fitness-arcade.service 2>/dev/null || true
if test -d /var/lib/fitness-arcade; then
    tar -czf "$backup/account-state.tar.gz" -C /var/lib fitness-arcade
    chmod 0600 "$backup/account-state.tar.gz"
fi
ln -sfn "$target" "$base/current-next"
mv -Tf "$base/current-next" "$base/current"
for unit in fitness-arcade.service fitness-arcade-proxy.service fitness-arcade-certificate.service fitness-arcade-certificate.timer; do
    install -m 0644 "$target/apps/arcade/deploy/pi/$unit" "/etc/systemd/system/$unit"
done
install -m 0644 "$target/apps/arcade/deploy/pi/Caddyfile" /etc/fitness-arcade.Caddyfile
systemctl daemon-reload
systemctl enable fitness-arcade.service fitness-arcade-proxy.service fitness-arcade-certificate.timer
systemctl restart fitness-arcade.service fitness-arcade-proxy.service
curl --fail --silent --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 http://127.0.0.1:18411/healthz
systemctl start fitness-arcade-certificate.timer
trap - EXIT
rm -f "/tmp/fitness-arcade-$release.tar.gz"
