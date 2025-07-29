@echo off
chcp 65001 >nul
title CS2 Нативный Сканер

echo.
echo ========================================
echo    CS2 Нативный Сканер Серверов
echo ========================================
echo.

REM Проверяем наличие Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python не найден! Установите Python 3.8+ с https://python.org
    echo.
    pause
    exit /b 1
)

echo ✅ Python найден
echo.

REM Проверяем наличие pip
pip --version >nul 2>&1
if errorlevel 1 (
    echo ❌ pip не найден! Переустановите Python
    echo.
    pause
    exit /b 1
)

echo ✅ pip найден
echo.

REM Устанавливаем зависимости
echo 📦 Установка зависимостей...
pip install -r requirements_scanner.txt

if errorlevel 1 (
    echo ❌ Ошибка установки зависимостей
    echo.
    pause
    exit /b 1
)

echo ✅ Зависимости установлены
echo.

echo.
echo 🚀 Запуск нативного сканера...
echo 📡 WebSocket сервер: ws://localhost:8765
echo 🔄 Сканирование каждые 2 секунды
echo.
echo 💡 Теперь откройте браузер и перейдите на http://localhost:8000
echo 💡 API ключ будет автоматически передан из браузера
echo.
echo ⚠️  Для остановки нажмите Ctrl+C
echo.

REM Запускаем сканер
python scanner.py --port 8765 --workers 50

echo.
echo 🛑 Сканер остановлен
pause 