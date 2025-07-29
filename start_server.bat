@echo off
echo ========================================
echo    CS2 Tool - Локальный сервер
echo ========================================
echo.
echo Запуск локального HTTP сервера...
echo.

REM Проверяем наличие Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ОШИБКА: Python не найден!
    echo Установите Python с https://python.org
    echo.
    pause
    exit /b 1
)

REM Запускаем HTTP сервер
echo Запуск HTTP сервера на http://localhost:8000
echo.
echo После запуска:
echo 1. Откройте браузер
echo 2. Перейдите по адресу: http://localhost:8000
echo 3. Введите ваш Steam Web API ключ
echo.
echo Для остановки сервера нажмите Ctrl+C
echo.

python server.py

pause 