import csv
import pymysql
import re

# --- 数据库配置 (请修改为你的密码) ---
DB_CONFIG = {
    'host': 'localhost',
    'user': 'arcaea_user',
    'password': 'YOUR_PASSWORD', # <-- 填入你的 MySQL 密码
    'database': 'arcaea_tracker',
    'charset': 'utf8mb4'
}

def generate_id(name):
    clean_name = re.sub(r'[^a-z0-9]', '_', name.lower())
    clean_name = re.sub(r'_+', '_', clean_name).strip('_')
    return clean_name if clean_name else f"song_{abs(hash(name))}"

def sync_csv_to_db(csv_filename='arcaea_constants.csv'):
    songs_dict = {}
    
    # 1. 解析 CSV 并合并难度
    with open(csv_filename, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            constant_str, name, difficulty = row.get('定数', '').strip(), row.get('曲目名称', '').strip(), row.get('难度', '').strip()
            if not name or not constant_str or difficulty == '未知': continue
            
            try:
                constant_val = float(constant_str)
            except ValueError:
                continue

            song_id = generate_id(name)
            if song_id not in songs_dict:
                songs_dict[song_id] = {'id': song_id, 'name': name, 'PST': None, 'PRS': None, 'FTR': None, 'ETR': None, 'BYD': None}
            
            if difficulty in songs_dict[song_id]:
                songs_dict[song_id][difficulty] = constant_val

    # 2. 写入 MySQL (使用 UPSERT 语法：有则更新定数，无则插入新歌)
    conn = pymysql.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    sql = """
        INSERT INTO songs (id, name, PST, PRS, FTR, ETR, BYD) 
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE 
        name=VALUES(name), PST=VALUES(PST), PRS=VALUES(PRS), 
        FTR=VALUES(FTR), ETR=VALUES(ETR), BYD=VALUES(BYD)
    """
    
    count = 0
    for s in songs_dict.values():
        cursor.execute(sql, (s['id'], s['name'], s['PST'], s['PRS'], s['FTR'], s['ETR'], s['BYD']))
        count += 1
        
    conn.commit()
    cursor.close()
    conn.close()
    print(f"✅ 成功将 {count} 首曲目的最新定数同步到了 MySQL 数据库！")

if __name__ == '__main__':
    sync_csv_to_db()
