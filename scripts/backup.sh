#!/bin/sh
# Bazaning to'liq zaxira nusxasi (pg_dump, siqilgan format). KEEP_DAYS kundan eskilari o'chiriladi.
# Qo'lda ishga tushirish: docker compose exec backup sh /backup.sh
set -e
mkdir -p /backups
f="/backups/inventar-$(date +%Y-%m-%d_%H%M).dump"
pg_dump -Fc -f "$f.tmp"
mv "$f.tmp" "$f"
echo "Zaxira tayyor: $f ($(du -h "$f" | cut -f1))"
find /backups -name 'inventar-*.dump' -mtime +"${KEEP_DAYS:-30}" -delete
