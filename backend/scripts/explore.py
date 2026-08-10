import os
import pandas as pd

print("🔍 Searching for CSV files in your project directory...\n")

# Find all CSV files in current folder and any subfolders automatically
csv_files = {}
for root, dirs, files in os.walk('.'):
    # Ignore virtual environment folders
    if 'venv' in root or '.git' in root:
        continue
    for file in files:
        if file.endswith('.csv'):
            rel_path = os.path.relpath(os.path.join(root, file), '.')
            csv_files[file] = rel_path

if not csv_files:
    print("❌ No CSV files found in the current directory or any subfolder!")
else:
    print("📁 Found the following CSV files in your project:")
    for name, path in csv_files.items():
        print(f"   - {name} (path: '{path}')")
    print("\n-----------------------------------\n")

    # Target file we want to inspect
    target_name = 'street_furniture_clean.csv'

    if target_name in csv_files:
        file_path = csv_files[target_name]
        print(f"🎯 Target found! Loading file from: '{file_path}'...\n")
        try:
            df = pd.read_csv(file_path)
            print("✅ Data loaded successfully! Here are the first 5 rows:\n")
            print(df.head())
            print("\n-----------------------------------\n")
            print("🔍 Dataset Info (columns, data types, and non-null counts):\n")
            df.info()
        except Exception as e:
            print(f"❌ Error reading file: {e}")
    else:
        # Fallback: load the first available CSV
        first_name, first_path = list(csv_files.items())[0]
        print(f"⚠️ Could not find '{target_name}'. Auto-loading '{first_name}' from '{first_path}' instead...\n")
        try:
            df = pd.read_csv(first_path)
            print("✅ Data loaded successfully! Here are the first 5 rows:\n")
            print(df.head())
            print("\n-----------------------------------\n")
            df.info()
        except Exception as e:
            print(f"❌ Error reading file: {e}")