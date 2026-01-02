@echo off
REM =========================================
REM DJ Web Decks - Setup Script (Windows CMD)
REM =========================================

title DJ Web Decks - Setup

echo.
echo ======================================
echo   DJ Web Decks - Configuracion
echo ======================================
echo.

REM Verificar Node.js
echo [1/3] Verificando Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: Node.js no encontrado
    echo   Descarga desde: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   OK - Node.js %NODE_VER%

REM Verificar FFmpeg
echo.
echo [2/3] Verificando FFmpeg...
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo   ADVERTENCIA: FFmpeg no encontrado
    echo   La conversion a MP3 no funcionara sin FFmpeg.
    echo   Instala con: winget install ffmpeg
) else (
    echo   OK - FFmpeg encontrado
)

REM Instalar dependencias
echo.
echo [3/3] Instalando dependencias npm...
call npm install
if %errorlevel% neq 0 (
    echo   ERROR: Fallo la instalacion
    pause
    exit /b 1
)
echo   OK - Dependencias instaladas

echo.
echo ======================================
echo   Configuracion completada!
echo ======================================
echo.
echo Para iniciar: npm start
echo Luego abre: http://localhost:3555
echo.

set /p START="Iniciar ahora? (s/n): "
if /i "%START%"=="s" (
    echo.
    echo Iniciando servidor...
    npm start
)
