#!/usr/bin/env python3
"""
Railway App - Комбинированный сервер для CS2 Tool
Запускает HTTP сервер и WebSocket сканер одновременно
"""

import os
import sys
import threading
import asyncio
import logging
from http.server import HTTPServer, SimpleHTTPRequestHandler
import time

# Импортируем наш сканер
from scanner_simple import CS2ScannerSimple

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

class RailwayApp:
    def __init__(self):
        self.http_port = int(os.environ.get('PORT', 8000))
        self.websocket_port = int(os.environ.get('WEBSOCKET_PORT', 8765))
        self.scanner = None
        self.http_server = None
        self.websocket_server = None
        
    def start_http_server(self):
        """Запуск HTTP сервера"""
        try:
            # Меняем рабочую директорию на папку public с файлами
            current_dir = os.path.dirname(os.path.abspath(__file__))
            public_dir = os.path.join(current_dir, 'public')
            os.chdir(public_dir)
            
            # Для Railway используем 0.0.0.0
            host = '0.0.0.0'
            self.http_server = HTTPServer((host, self.http_port), CORSRequestHandler)
            
            logger.info(f"🌐 HTTP сервер запущен на http://{host}:{self.http_port}")
            logger.info(f"📁 Обслуживаемые файлы: {os.getcwd()}")
            
            self.http_server.serve_forever()
        except Exception as e:
            logger.error(f"❌ Ошибка запуска HTTP сервера: {e}")
    
    def start_websocket_server_background(self):
        """Запуск WebSocket сервера в фоновом режиме"""
        try:
            import websockets
            import asyncio
            
            async def run_websocket():
                try:
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
                    
                    # Держим WebSocket сервер запущенным
                    await self.websocket_server.wait_closed()
                    
                except Exception as e:
                    logger.error(f"❌ Ошибка запуска WebSocket сервера: {e}")
            
            # Запускаем WebSocket в отдельном потоке
            def run_async():
                asyncio.run(run_websocket())
            
            websocket_thread = threading.Thread(target=run_async, daemon=True)
            websocket_thread.start()
            
        except Exception as e:
            logger.error(f"❌ Ошибка запуска WebSocket сервера: {e}")
    
    def run(self):
        """Запуск всего приложения"""
        print("=" * 60)
        print("   CS2 Tool - Railway App")
        print("=" * 60)
        print(f"🌐 HTTP порт: {self.http_port}")
        print(f"🔌 WebSocket порт: {self.websocket_port}")
        print("⏹️  Нажмите Ctrl+C для остановки")
        print()
        
        # Создаем и запускаем сканер
        self.scanner = CS2ScannerSimple(max_workers=10)
        self.scanner.start_scanning()
        logger.info("🚀 Сканирование серверов запущено")
        
        # Запускаем WebSocket сервер в фоновом режиме
        self.start_websocket_server_background()
        
        # Запускаем HTTP сервер в основном потоке (для healthcheck)
        try:
            self.start_http_server()
        except KeyboardInterrupt:
            print("\n🛑 Остановка приложения...")
            if self.http_server:
                self.http_server.shutdown()
            if self.scanner:
                self.scanner.stop_scanning()
            print("✅ Приложение остановлено")

if __name__ == "__main__":
    app = RailwayApp()
    app.run() 