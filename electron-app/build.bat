@echo off
echo 🚀 Сборка CS2 Tool Desktop Application...
echo.

echo 📦 Установка зависимостей...
npm install
if %errorlevel% neq 0 (
    echo ❌ Ошибка установки зависимостей
    pause
    exit /b 1
)

echo.
echo 🔨 Сборка приложения для Windows...
npm run build-win
if %errorlevel% neq 0 (
    echo ❌ Ошибка сборки
    pause
    exit /b 1
)

echo.
echo ✅ Сборка завершена успешно!
echo 📁 Файлы находятся в папке dist/
echo.
pause 