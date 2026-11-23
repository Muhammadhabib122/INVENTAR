#!/bin/sh
# Zaxiradan tiklash. DIQQAT: bazadagi hozirgi ma'lumotlar zaxiradagisi bilan almashtiriladi.
# Ishlatish (loyiha papkasida): sh scripts/restore.sh backups/inventar-2026-11-23_0230.dump
set -e
if [ -z "$1" ] || [ ! -f "$1" ]; then
  echo "Ishlatish: sh scripts/restore.sh backups/FAYL.dump"
  exit 1
fi
echo "Ilova to'xtatilmoqda..."
docker compose stop app
echo "Tiklanmoqda: $1"
docker compose exec -T db pg_restore -U inventar -d inventar --clean --if-exists --no-owner < "$1"
docker compose start app
echo "Tayyor. Ilova qayta ishga tushdi."
