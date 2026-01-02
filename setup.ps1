# =========================================
# DJ Web Decks - Setup Script (Windows)
# =========================================
# Ejecutar con: powershell -ExecutionPolicy Bypass -File setup.ps1

$Host.UI.RawUI.WindowTitle = "DJ Web Decks - Setup"

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  DJ Web Decks - Configuracion" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Funcion para verificar comandos
function Test-Command {
    param($Command)
    try {
        $null = Get-Command $Command -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# 1. Verificar Node.js
Write-Host "[1/4] Verificando Node.js..." -ForegroundColor Yellow
if (Test-Command "node") {
    $nodeVersion = node -v
    Write-Host "  OK - Node.js $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Node.js no encontrado" -ForegroundColor Red
    Write-Host "  Descarga desde: https://nodejs.org/" -ForegroundColor White
    Read-Host "Presiona Enter para salir"
    exit 1
}

# 2. Verificar FFmpeg
Write-Host ""
Write-Host "[2/4] Verificando FFmpeg..." -ForegroundColor Yellow
if (Test-Command "ffmpeg") {
    $ffmpegVersion = (ffmpeg -version | Select-Object -First 1)
    Write-Host "  OK - FFmpeg encontrado" -ForegroundColor Green
} else {
    Write-Host "  ADVERTENCIA: FFmpeg no encontrado" -ForegroundColor Yellow
    Write-Host "  La conversion a MP3 no funcionara sin FFmpeg." -ForegroundColor White
    Write-Host ""
    Write-Host "  Para instalar FFmpeg en Windows:" -ForegroundColor White
    Write-Host "  1. Descarga desde: https://ffmpeg.org/download.html" -ForegroundColor Gray
    Write-Host "  2. O usa winget: winget install ffmpeg" -ForegroundColor Gray
    Write-Host "  3. O usa chocolatey: choco install ffmpeg" -ForegroundColor Gray
    Write-Host ""
    $continue = Read-Host "Continuar sin FFmpeg? (s/n)"
    if ($continue -ne "s" -and $continue -ne "S") {
        exit 1
    }
}

# 3. Instalar dependencias npm
Write-Host ""
Write-Host "[3/4] Instalando dependencias npm..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "  node_modules existe, verificando..." -ForegroundColor Gray
}
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - Dependencias instaladas" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Fallo la instalacion de dependencias" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

# 4. Verificar yt-dlp
Write-Host ""
Write-Host "[4/4] Verificando yt-dlp..." -ForegroundColor Yellow
if (Test-Path "yt-dlp.exe") {
    Write-Host "  OK - yt-dlp.exe ya existe" -ForegroundColor Green
} else {
    Write-Host "  yt-dlp.exe se descargara automaticamente al iniciar" -ForegroundColor Gray
}

# Resumen
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Configuracion completada!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para iniciar la aplicacion:" -ForegroundColor White
Write-Host "  npm start" -ForegroundColor Cyan
Write-Host ""
Write-Host "Luego abre en tu navegador:" -ForegroundColor White
Write-Host "  http://localhost:3555" -ForegroundColor Cyan
Write-Host ""

# Preguntar si quiere iniciar
$start = Read-Host "Iniciar ahora? (s/n)"
if ($start -eq "s" -or $start -eq "S") {
    Write-Host ""
    Write-Host "Iniciando servidor..." -ForegroundColor Green
    npm start
}
