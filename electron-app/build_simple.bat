@echo off
echo 🚀 Сборка CS2 Tool Desktop Application (Упрощенная версия)
echo.

echo 📦 Проверка зависимостей...
if not exist "node_modules" (
    echo 📥 Установка Node.js зависимостей...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Ошибка установки Node.js зависимостей
        pause
        exit /b 1
    )
) else (
    echo ✅ Node.js зависимости уже установлены
)

echo.
echo 🐍 Проверка Python зависимостей...
python -c "import websockets, requests" 2>nul
if %errorlevel% neq 0 (
    echo 📥 Установка Python зависимостей...
    pip install -r requirements_simple.txt
    if %errorlevel% neq 0 (
        echo ❌ Ошибка установки Python зависимостей
        pause
        exit /b 1
    )
) else (
    echo ✅ Python зависимости уже установлены
)

echo.
echo 🔨 Сборка приложения для Windows...
npm run build-win
if %errorlevel% neq 0 (
    echo ❌ Ошибка сборки
    echo.
    echo 💡 Попробуйте:
    echo   1. Убедитесь, что Node.js установлен
    echo   2. Убедитесь, что Python установлен
    echo   3. Запустите от имени администратора
    pause
    exit /b 1
)

echo.
echo ✅ Сборка завершена успешно!
echo 📁 Файлы находятся в папке dist/
echo.
echo 🎉 Готово! Теперь у вас есть десктопное приложение CS2 Tool!
echo.
pause 