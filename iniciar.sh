#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Hace falta Node.js para iniciar la app: https://nodejs.org"
  exit 1
fi
exec node tools/servir.js "$@"
