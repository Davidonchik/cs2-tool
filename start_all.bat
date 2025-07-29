@echo off
chcp 65001 >nul
title CS2 Tool - Полный запуск

echo ========================================
echo    CS2 Tool - Полный запуск
echo ========================================
echo.
echo Запуск HTTP сервера и сканера...
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
echo 📦 Установка зависимостей...
pip install requests websocket-client websockets

if errorlevel 1 (
    echo ❌ Ошибка установки зависимостей
    pause
    exit /b 1
)

echo ✅ Зависимости установлены
echo.

REM Запускаем HTTP сервер в фоне
echo 🌐 Запуск HTTP сервера на порту 8000...
start "CS2 HTTP Server" cmd /c "python server.py"

REM Ждем немного
timeout /t 2 /nobreak >nul

REM Запускаем сканер
echo 📡 Запуск сканера на порту 8765...
start "CS2 Scanner" cmd /c "python scanner_simple.py --workers 100"

echo.
echo ✅ Все компоненты запущены!
echo.
echo 📋 Инструкции:
echo 1. Откройте браузер
echo 2. Перейдите по адресу: http://localhost:8000
echo 3. Введите ваш Steam Web API ключ
echo 4. Начните сканирование
echo.
echo ⏹️  Для остановки закройте окна командных строк
echo.

pause 