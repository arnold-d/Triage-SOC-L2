#!/bin/sh
# Abre la app. Node.js solo hace falta para usar Ollama (IA local); sin Node, se abre el archivo directamente.
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  exec node tools/servir.js "$@"
fi
app="$(pwd)/app/index.html"
echo "No se encontró Node.js: se abre la app directamente en el navegador."
echo "La app funciona entera sin Node. Node solo hace falta para usar Ollama: https://nodejs.org"
if [ "$(uname)" = "Darwin" ]; then abrir=open; else abrir=xdg-open; fi
if command -v "$abrir" >/dev/null 2>&1 && "$abrir" "$app" >/dev/null 2>&1; then
  exit 0
fi
echo "Abre este archivo en tu navegador: $app"
