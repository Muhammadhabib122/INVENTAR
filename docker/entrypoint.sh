#!/bin/sh
# Konteyner ishga tushganda: avval baza tuzilmasini yangilaydi, keyin ilovani ishga tushiradi.
set -e
echo "Baza migratsiyalari qo'llanmoqda..."
node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema=prisma/schema.prisma
echo "Ilova ishga tushmoqda (port $PORT)..."
exec node server.js
