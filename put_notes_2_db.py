import json
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

def add_columns_if_not_exist(cursor):
    cursor.execute("SHOW COLUMNS FROM songs")
    existing_columns = [row[0] for row in cursor.fetchall()]
    columns_to_add = ['notes_pst', 'notes_prs', 'notes_ftr', 'notes_byd', 'notes_etr']
    
    for col in columns_to_add:
        if col not in existing_columns:
            cursor.execute(f"ALTER TABLE songs ADD COLUMN {col} INT;")
            print(f"✅ 添加列 [{col}] 成功")
        else:
            print(f"ℹ️ 列 [{col}] 已存在，跳过")

def sync_notes_to_db(json_filename='arcaea_notes.json'):
    with open(json_filename, 'r', encoding='utf-8') as f:
        notes_list = json.load(f)

    conn = pymysql.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    # 开始写入前新建列
    try:
        add_columns_if_not_exist(cursor)
    except Exception as e:
        print(f"⚠️ 添加列时发生错误: {e}")
        
    # 根据用户要求，先刷洗清空之前的错误数据
    try:
        cursor.execute("UPDATE songs SET notes_byd = NULL, notes_etr = NULL")
        conn.commit()
        print("✅ 成功清空旧的 notes_byd 和 notes_etr 字段数据")
    except Exception as e:
        print(f"⚠️ 清空旧数据时发生错误: {e}")
    
    sql = """
        UPDATE songs 
        SET notes_pst = %s, 
            notes_prs = %s, 
            notes_ftr = %s, 
            notes_byd = %s, 
            notes_etr = %s
        WHERE name = %s
    """
    
    count = 0
    for song in notes_list:
        name = song.get('name')
        if not name: continue
            
        # 根据用户要求，通过 name 匹配
        val_byd = None
        val_etr = song.get('notes_etr')
        scraped_byd = song.get('notes_byd')
        
        # 查询该曲目的 BYD 常数值，使用 name 进行匹配
        cursor.execute("SELECT BYD FROM songs WHERE name = %s", (name,))
        row = cursor.fetchone()
        
        if row:
            if row[0] is not None:
                # 数据库中该曲目 BYD 常数不为 NULL，说明它真有 BYD 难度
                val_byd = scraped_byd
            else:
                # 数据库中 BYD 常数为 NULL，说明它没有 BYD，那么wiki上填的其实是 ETR 的物量
                val_etr = scraped_byd if scraped_byd is not None else val_etr
            
            # 使用 UPDATE 语句精准更新对应曲目的 notes 数据
            cursor.execute(sql, (
                song.get('notes_pst'), 
                song.get('notes_prs'), 
                song.get('notes_ftr'), 
                val_byd, 
                val_etr,
                name  # WHERE name = %s
            ))
            count += 1
        else:
            # 如果数据库中确实没有匹配的 name，由于是用 UPDATE 进行操作，选择跳过录入
            # (避免插入一条没有基础信息的数据)
            print(f"⚠️ 在数据库中未找到曲目名为 '{name}' 的数据，跳过录入物量")
            continue
        
    conn.commit()
    cursor.close()
    conn.close()
    print(f"✅ 成功将 {count} 首曲目的物量信息通过 name 匹配同步到了 MySQL 数据库！")

if __name__ == '__main__':
    sync_notes_to_db()
