#!/bin/sh
set -eu
release="$1"
case "$release" in *[!a-zA-Z0-9-]*|'') exit 2;; esac
base=/opt/fitness-arcade
target="$base/releases/$release"
backup="$base/rollback/$release"
# This installer extends the existing dedicated ingress; never start legacy Caddy.
systemctl is-active --quiet fitness-sharing.service fitness-sharing-proxy.service
command -v node >/dev/null
id fitness-arcade >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin fitness-arcade
install -d -m 0755 "$target"
tar -xzf "/tmp/fitness-arcade-$release.tar.gz" -C "$target"
test -f "$target/client/index.html"
test -f "$target/client/runtime/pose_landmarker_lite.task"
test -f "$target/release.json"
/usr/bin/caddy validate --config "$target/apps/arcade/deploy/gcp/Caddyfile" --adapter caddyfile
previous=$(readlink "$base/current" || true)
install -d -m 0700 "$backup"
printf '%s\n' "$previous" > "$backup/previous-release"
cp -p /etc/fitness-sharing.Caddyfile "$backup/Caddyfile"
if test -f /etc/systemd/system/fitness-arcade.service; then cp -p /etc/systemd/system/fitness-arcade.service "$backup/fitness-arcade.service"; fi
rollback() {
    echo 'Restoring the prior arcade release and dedicated proxy configuration.' >&2
    systemctl stop fitness-arcade.service || true
    cp -p "$backup/Caddyfile" /etc/fitness-sharing.Caddyfile
    if test -n "$previous"; then
        ln -sfn "$previous" "$base/current"
        cp -p "$backup/fitness-arcade.service" /etc/systemd/system/fitness-arcade.service
        systemctl daemon-reload
        systemctl start fitness-arcade.service
    else
        systemctl disable fitness-arcade.service || true
    fi
    systemctl restart fitness-sharing-proxy.service
}
trap rollback EXIT
if test -d /var/lib/fitness-arcade; then
    # Stop the sole ledger writer before taking a consistent private state backup.
    systemctl stop fitness-arcade.service
    tar -czf "$backup/account-state.tar.gz" -C /var/lib fitness-arcade
    chmod 0600 "$backup/account-state.tar.gz"
fi
ln -sfn "$target" "$base/current-next"
mv -Tf "$base/current-next" "$base/current"
install -m 0644 "$target/apps/arcade/deploy/gcp/fitness-arcade.service" /etc/systemd/system/fitness-arcade.service
systemctl daemon-reload
systemctl enable fitness-arcade.service
systemctl restart fitness-arcade.service
curl --fail --silent --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 http://127.0.0.1:8411/healthz
install -m 0644 "$target/apps/arcade/deploy/gcp/Caddyfile" /etc/fitness-sharing.Caddyfile
systemctl restart fitness-sharing-proxy.service
systemctl is-active --quiet fitness-arcade.service fitness-sharing.service fitness-sharing-proxy.service
curl --fail --silent --retry 5 --retry-connrefused --retry-delay 1 --max-time 10 --resolve fitness.integ.life:443:127.0.0.1 https://fitness.integ.life/healthz
trap - EXIT
rm -f "/tmp/fitness-arcade-$release.tar.gz"
