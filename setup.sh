#!/bin/bash
# =========================================
# DJ Web Decks - Setup Script (Linux/macOS)
# =========================================

set -e

echo ""
echo "🎧 DJ Web Decks - Configuración"
echo "================================"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Función para verificar comandos
check_command() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 encontrado"
        return 0
    else
        echo -e "${RED}✗${NC} $1 no encontrado"
        return 1
    fi
}

# 1. Verificar Node.js
echo -e "${CYAN}[1/4]${NC} Verificando Node.js..."
if check_command node; then
    NODE_VERSION=$(node -v)
    echo "       Versión: $NODE_VERSION"
else
    echo -e "${RED}Error: Node.js es requerido${NC}"
    echo "Instala desde: https://nodejs.org/"
    exit 1
fi

# 2. Verificar FFmpeg
echo ""
echo -e "${CYAN}[2/4]${NC} Verificando FFmpeg..."
if check_command ffmpeg; then
    FFMPEG_VERSION=$(ffmpeg -version | head -1 | cut -d' ' -f3)
    echo "       Versión: $FFMPEG_VERSION"
else
    echo -e "${YELLOW}Advertencia: FFmpeg no encontrado${NC}"
    echo "       La conversión a MP3 no funcionará sin FFmpeg."
    echo ""
    echo "       Para instalar FFmpeg:"
    echo "       - Ubuntu/Debian: sudo apt install ffmpeg"
    echo "       - macOS:         brew install ffmpeg"
    echo "       - Arch:          sudo pacman -S ffmpeg"
    echo ""
    read -p "¿Continuar sin FFmpeg? (s/n): " CONTINUE
    if [[ $CONTINUE != "s" && $CONTINUE != "S" ]]; then
        exit 1
    fi
fi

# 3. Instalar dependencias npm
echo ""
echo -e "${CYAN}[3/4]${NC} Instalando dependencias npm..."
if [ -d "node_modules" ]; then
    echo "       node_modules existe, verificando..."
    npm install
else
    echo "       Instalando desde cero..."
    npm install
fi
echo -e "${GREEN}✓${NC} Dependencias instaladas"

# 4. Verificar yt-dlp
echo ""
echo -e "${CYAN}[4/4]${NC} Verificando yt-dlp..."
if [ -f "yt-dlp" ]; then
    echo -e "${GREEN}✓${NC} yt-dlp ya existe"
else
    echo "       yt-dlp se descargará automáticamente al iniciar el servidor"
fi

# Resumen
echo ""
echo "================================"
echo -e "${GREEN}✓ Configuración completada${NC}"
echo "================================"
echo ""
echo "Para iniciar la aplicación:"
echo -e "  ${CYAN}npm start${NC}"
echo ""
echo "Luego abre en tu navegador:"
echo -e "  ${CYAN}http://localhost:3555${NC}"
echo ""
