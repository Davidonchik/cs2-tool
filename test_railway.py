#!/usr/bin/env python3
"""
Тестовый файл для Railway
"""

import os
import sys

def main():
    print("=" * 50)
    print("   CS2 Tool - Railway Test")
    print("=" * 50)
    
    # Проверяем переменные окружения
    port = os.environ.get('PORT', '8000')
    print(f"🌐 PORT: {port}")
    
    # Проверяем файлы
    current_dir = os.getcwd()
    print(f"📁 Текущая директория: {current_dir}")
    
    files = os.listdir('.')
    print(f"📄 Файлы в директории: {len(files)}")
    for file in files[:10]:  # Показываем первые 10 файлов
        print(f"   - {file}")
    
    # Проверяем папку public
    public_dir = os.path.join(current_dir, 'public')
    if os.path.exists(public_dir):
        print(f"✅ Папка public найдена: {public_dir}")
        public_files = os.listdir(public_dir)
        print(f"📄 Файлов в public: {len(public_files)}")
    else:
        print(f"❌ Папка public не найдена: {public_dir}")
    
    print("✅ Тест завершен успешно")
    return 0

if __name__ == "__main__":
    sys.exit(main()) 