#!/bin/bash

# Directorio de la aplicación (asume que el script está en la raíz del proyecto)
APP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Función para verificar si un comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# --- Verificación de Dependencias ---
echo "Verificando dependencias..."
for cmd in git node npm; do
    if ! command_exists $cmd; then
        echo "Error: El comando '$cmd' no se encuentra. Por favor, instálalo para continuar."
        exit 1
    fi
done
echo "Dependencias correctas."

# --- Navegar al directorio de la app y actualizar ---
cd "$APP_DIR" || exit
echo "Buscando actualizaciones..."
git pull

# --- Instalar dependencias de Node.js ---
echo "Instalando/actualizando dependencias (npm)..."
npm install --no-progress --quiet

# --- Iniciar la aplicación ---
# Matar cualquier instancia anterior en el mismo puerto para evitar conflictos
fuser -k 3555/tcp > /dev/null 2>&1

echo "Iniciando servidor de la aplicación..."
node server.js &
SERVER_PID=$!

# Esperar un momento a que el servidor esté listo
sleep 2

echo "Servidor iniciado (PID: $SERVER_PID)."
echo "Abriendo la interfaz en el navegador..."

# Abrir la URL en el navegador por defecto
xdg-open http://localhost:3555

echo "----------------------------------------------------"
echo "La aplicación DJ está en ejecución."
echo "Para detenerla, cierra esta ventana o ejecuta: kill $SERVER_PID"
echo "----------------------------------------------------"
