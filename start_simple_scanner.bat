@echo off
chcp 65001 >nul
title CS2 Упрощенный Сканер Серверов

echo ========================================
echo    CS2 Упрощенный Сканер Серверов
echo ========================================
echo.

REM Проверяем наличие Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python не найден!
    echo Установите Python с https://python.org
    pause
    exit /b 1
)
echo ✅ Python найден

REM Проверяем наличие pip
pip --version >nul 2>&1
if errorlevel 1 (
    echo ❌ pip не найден!
    pause
    exit /b 1
)
echo ✅ pip найден

echo.
echo 📦 Установка простых зависимостей...
pip install requests websocket-client websockets

if errorlevel 1 (
    echo ❌ Ошибка установки зависимостей
    pause
    exit /b 1
)

echo ✅ Зависимости установлены
echo.
echo 🚀 Запуск упрощенного сканера...
echo 📡 Для веб-интерфейса запустите server.py отдельно
echo.

python scanner_simple.py --workers 100

pause 