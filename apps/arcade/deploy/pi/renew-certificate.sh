#!/bin/sh
set -eu
umask 077
directory=/etc/fitness-arcade
if openssl x509 -checkend 2592000 -noout -in "$directory/client.crt" >/dev/null; then exit 0; fi
openssl x509 -req -in "$directory/client.csr" \
  -CA "$directory/ca/root.crt" -CAkey "$directory/ca/root.key" -CAcreateserial \
  -days 90 -sha256 -extfile "$directory/client.ext" -out "$directory/client.crt.new"
openssl verify -CAfile "$directory/ca/root.crt" "$directory/client.crt.new"
chown root:fitness-arcade "$directory/client.crt.new"
chmod 0640 "$directory/client.crt.new"
mv "$directory/client.crt.new" "$directory/client.crt"
systemctl try-restart fitness-arcade.service
