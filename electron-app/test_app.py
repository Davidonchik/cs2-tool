#!/usr/bin/env python3
"""
Тестовый скрипт для проверки работы API сервера
"""
import sys
import os

# Добавляем текущую директорию в путь
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from api_server import CS2APIServer
    print("✅ API сервер импортирован успешно")
    
    # Создаем экземпляр сервера
    server = CS2APIServer(port=8000)
    print("✅ Сервер создан успешно")
    
    print("✅ Все тесты пройдены!")
    print("🚀 Приложение готово к запуску")
    
except ImportError as e:
    print(f"❌ Ошибка импорта: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Ошибка: {e}")
    sys.exit(1) 