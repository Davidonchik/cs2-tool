#!/usr/bin/env python3
"""
Railway Full - Полнофункциональная версия для CS2 Tool
HTTP сервер + WebSocket сервер + Сканер CS2
"""

import os
import sys
import asyncio
import threading
import time
import logging
from http.server import HTTPServer, SimpleHTTPRequestHandler
import json

# Импортируем наш сканер
try:
    from scanner_simple import CS2ScannerSimple
except ImportError as e:
    print(f"❌ Ошибка импорта сканера: {e}")
    sys.exit(1)

# Настройка логирования
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

class RailwayFullApp:
    def __init__(self):
        self.http_port = int(os.environ.get('PORT', 8000))
        self.websocket_port = int(os.environ.get('WEBSOCKET_PORT', 8765))
        self.scanner = None
        self.http_server = None
        self.websocket_server = None
        self.is_running = False
        
    def start_http_server(self):
        """Запуск HTTP сервера"""
        try:
            # Меняем рабочую директорию на папку public
            current_dir = os.path.dirname(os.path.abspath(__file__))
            public_dir = os.path.join(current_dir, 'public')
            
            if os.path.exists(public_dir):
                os.chdir(public_dir)
                logger.info(f"📁 Обслуживаемые файлы: {os.getcwd()}")
            else:
                logger.warning(f"⚠️ Папка public не найдена: {public_dir}")
            
            # Запускаем HTTP сервер
            host = '0.0.0.0'
            self.http_server = HTTPServer((host, self.http_port), CORSRequestHandler)
            
            logger.info(f"🌐 HTTP сервер запущен на http://{host}:{self.http_port}")
            logger.info("✅ Healthcheck должен работать")
            
            self.http_server.serve_forever()
            
        except Exception as e:
            logger.error(f"❌ Ошибка запуска HTTP сервера: {e}")
    
    async def start_websocket_server(self):
        """Запуск WebSocket сервера"""
        try:
            import websockets
            
            # Создаем сканер
            self.scanner = CS2ScannerSimple(max_workers=10)
            logger.info("🔧 Сканер CS2 создан")
            
            # Запускаем WebSocket сервер
            host = '0.0.0.0'
            self.websocket_server = await websockets.serve(
                self.scanner.handle_websocket, 
                host, 
                self.websocket_port, 
                ping_interval=None, 
                ping_timeout=None
            )
            
            logger.info(f"🔌 WebSocket сервер запущен на ws://{host}:{self.websocket_port}")
            
            # Запускаем сканирование
            self.scanner.start_scanning()
            logger.info("🚀 Сканирование серверов запущено")
            
            # Держим WebSocket сервер запущенным
            await self.websocket_server.wait_closed()
            
        except Exception as e:
            logger.error(f"❌ Ошибка запуска WebSocket сервера: {e}")
    
    def run_websocket_in_thread(self):
        """Запуск WebSocket сервера в отдельном потоке"""
        try:
            asyncio.run(self.start_websocket_server())
        except Exception as e:
            logger.error(f"❌ Ошибка в WebSocket потоке: {e}")
    
    def run(self):
        """Запуск всего приложения"""
        print("=" * 60)
        print("   CS2 Tool - Railway Full")
        print("=" * 60)
        print(f"🌐 HTTP порт: {self.http_port}")
        print(f"🔌 WebSocket порт: {self.websocket_port}")
        print("⏹️  Нажмите Ctrl+C для остановки")
        print()
        
        self.is_running = True
        
        # Запускаем WebSocket сервер в отдельном потоке
        websocket_thread = threading.Thread(target=self.run_websocket_in_thread, daemon=True)
        websocket_thread.start()
        
        # Даем время WebSocket серверу запуститься
        time.sleep(2)
        
        # Запускаем HTTP сервер в основном потоке (для healthcheck)
        try:
            self.start_http_server()
        except KeyboardInterrupt:
            print("\n🛑 Остановка приложения...")
            self.is_running = False
            if self.http_server:
                self.http_server.shutdown()
            if self.scanner:
                self.scanner.stop_scanning()
            print("✅ Приложение остановлено")

def main():
    """Главная функция"""
    try:
        app = RailwayFullApp()
        app.run()
    except Exception as e:
        logger.error(f"❌ Критическая ошибка: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 