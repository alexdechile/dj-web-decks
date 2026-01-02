#!/data/data/com.termux/files/usr/bin/bash
# =========================================
# DJ Web Decks - Setup Script (Termux/Android)
# =========================================

set -e

echo ""
echo "🎧 DJ Web Decks - Configuración (Termux)"
echo "=========================================="
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Función para verificar paquetes
check_pkg() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 instalado"
        return 0
    else
        echo -e "${YELLOW}→${NC} Instalando $1..."
        pkg install -y "$2" 2>/dev/null || {
            echo -e "${RED}✗${NC} Error instalando $1"
            return 1
        }
        echo -e "${GREEN}✓${NC} $1 instalado"
        return 0
    fi
}

# 0. Actualizar repositorios
echo -e "${CYAN}[0/5]${NC} Actualizando repositorios..."
pkg update -y
echo -e "${GREEN}✓${NC} Repositorios actualizados"

# 1. Verificar/Instalar Node.js
echo ""
echo -e "${CYAN}[1/5]${NC} Verificando Node.js..."
check_pkg node nodejs
NODE_VERSION=$(node -v 2>/dev/null || echo "error")
echo "       Versión: $NODE_VERSION"

# 2. Verificar/Instalar Python (para yt-dlp)
echo ""
echo -e "${CYAN}[2/5]${NC} Verificando Python..."
check_pkg python python

# 3. Verificar/Instalar FFmpeg
echo ""
echo -e "${CYAN}[3/5]${NC} Verificando FFmpeg..."
check_pkg ffmpeg ffmpeg
FFMPEG_VERSION=$(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3 || echo "error")
echo "       Versión: $FFMPEG_VERSION"

# 4. Verificar/Instalar yt-dlp via pip
echo ""
echo -e "${CYAN}[4/5]${NC} Verificando yt-dlp..."
if command -v yt-dlp &> /dev/null; then
    echo -e "${GREEN}✓${NC} yt-dlp instalado"
    YTDLP_VERSION=$(yt-dlp --version 2>/dev/null || echo "error")
    echo "       Versión: $YTDLP_VERSION"
else
    echo -e "${YELLOW}→${NC} Instalando yt-dlp via pip..."
    pip install -U yt-dlp
    echo -e "${GREEN}✓${NC} yt-dlp instalado"
fi

# 5. Instalar dependencias npm
echo ""
echo -e "${CYAN}[5/5]${NC} Instalando dependencias npm..."
if [ -d "node_modules" ]; then
    echo "       node_modules existe, verificando..."
fi
npm install
echo -e "${GREEN}✓${NC} Dependencias npm instaladas"

# Configuración especial para Termux
echo ""
echo -e "${CYAN}[Extra]${NC} Configurando para Termux..."

# Permitir almacenamiento si no está configurado
if [ ! -d ~/storage ]; then
    echo -e "${YELLOW}→${NC} Solicitando acceso al almacenamiento..."
    termux-setup-storage 2>/dev/null || true
fi

# Resumen
echo ""
echo "=========================================="
echo -e "${GREEN}✓ Configuración completada${NC}"
echo "=========================================="
echo ""
echo "Para iniciar la aplicación:"
echo -e "  ${CYAN}npm start${NC}"
echo ""
echo "Luego abre en tu navegador:"
echo -e "  ${CYAN}http://localhost:3555${NC}"
echo ""
echo -e "${YELLOW}TIP:${NC} Para mantener Termux activo en segundo plano:"
echo "  termux-wake-lock"
echo ""
echo -e "${YELLOW}TIP:${NC} Para acceder desde otro dispositivo en la misma red:"
echo "  Usa la IP de tu tablet (ifconfig wlan0)"
echo ""

# Preguntar si iniciar
read -p "¿Iniciar ahora? (s/n): " START
if [[ $START == "s" || $START == "S" ]]; then
    echo ""
    echo "Iniciando servidor..."
    # Activar wake lock para que no se duerma
    termux-wake-lock 2>/dev/null || true
    npm start
fi
