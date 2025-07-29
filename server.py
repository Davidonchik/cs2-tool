#!/usr/bin/env python3
"""
Простой HTTP сервер для CS2 Tool
Обслуживает веб-интерфейс на порту 8000
"""

import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
import time

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

def start_http_server(port=8000):
    """Запуск HTTP сервера"""
    try:
        # Меняем рабочую директорию на папку public с файлами
        current_dir = os.path.dirname(os.path.abspath(__file__))
        public_dir = os.path.join(current_dir, 'public')
        os.chdir(public_dir)
        
        # Для Railway используем 0.0.0.0 вместо localhost
        host = '0.0.0.0'
        server = HTTPServer((host, port), CORSRequestHandler)
        print(f"🌐 HTTP сервер запущен на http://{host}:{port}")
        print(f"📁 Обслуживаемые файлы: {os.getcwd()}")
        print("⏹️  Нажмите Ctrl+C для остановки")
        print()
        
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Остановка HTTP сервера...")
        server.shutdown()
    except Exception as e:
        print(f"❌ Ошибка запуска HTTP сервера: {e}")

if __name__ == "__main__":
    print("=" * 50)
    print("   CS2 Tool - HTTP Сервер")
    print("=" * 50)
    print()
    
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("❌ Неверный порт, используем 8000")
    
    start_http_server(port) 