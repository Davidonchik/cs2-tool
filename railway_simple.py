#!/usr/bin/env python3
"""
Railway Simple - Упрощенная версия для Railway
Только HTTP сервер для healthcheck
"""

import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
import time

# Настройка логирования
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def log_message(self, format, *args):
        # Убираем лишние логи
        pass

def main():
    """Главная функция"""
    print("=" * 50)
    print("   CS2 Tool - Railway Simple")
    print("=" * 50)
    
    # Получаем порт из переменной окружения
    port = int(os.environ.get('PORT', 8000))
    print(f"🌐 HTTP порт: {port}")
    print("⏹️  Нажмите Ctrl+C для остановки")
    print()
    
    try:
        # Меняем рабочую директорию на папку public
        current_dir = os.path.dirname(os.path.abspath(__file__))
        public_dir = os.path.join(current_dir, 'public')
        
        if os.path.exists(public_dir):
            os.chdir(public_dir)
            logger.info(f"📁 Обслуживаемые файлы: {os.getcwd()}")
        else:
            logger.warning(f"⚠️ Папка public не найдена: {public_dir}")
            # Создаем простую HTML страницу
            with open('index.html', 'w', encoding='utf-8') as f:
                f.write('''
<!DOCTYPE html>
<html>
<head>
    <title>CS2 Tool - Railway</title>
    <meta charset="utf-8">
</head>
<body>
    <h1>CS2 Tool</h1>
    <p>Приложение успешно запущено на Railway!</p>
    <p>Время запуска: ''' + time.strftime('%Y-%m-%d %H:%M:%S') + '''</p>
</body>
</html>
                ''')
        
        # Запускаем HTTP сервер
        host = '0.0.0.0'
        server = HTTPServer((host, port), CORSRequestHandler)
        
        logger.info(f"🌐 HTTP сервер запущен на http://{host}:{port}")
        logger.info("✅ Healthcheck должен работать")
        
        server.serve_forever()
        
    except KeyboardInterrupt:
        print("\n🛑 Остановка сервера...")
        server.shutdown()
        print("✅ Сервер остановлен")
    except Exception as e:
        logger.error(f"❌ Ошибка запуска сервера: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 