import json
import pymysql

# --- 数据库配置 (请使用你之前设置的密码) ---
DB_CONFIG = {
    'host': 'localhost',
    'user': 'arcaea_user',       # 你的专属账号
    'password': 'YOUR_PASSWORD', # <-- 填入你的密码
    'database': 'arcaea_tracker',
    'charset': 'utf8mb4'
}

def sync_aliases_to_db(json_filename='arcaea_aliases.json'):
    # 1. 读取 JSON 别名文件
    try:
        with open(json_filename, 'r', encoding='utf-8') as f:
            aliases_dict = json.load(f)
    except FileNotFoundError:
        print(f"❌ 找不到文件 {json_filename}，请确认路径是否正确。")
        return

    # 2. 连接数据库
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        return

    # 3. 准备 UPDATE 语句
    sql = "UPDATE songs SET aliases = %s WHERE name = %s"
    
    success_count = 0
    not_found_count = 0

    print("开始将曲目别名同步至数据库...")
    for song_name, alias_list in aliases_dict.items():
        # 将数组 ["病女", "gl"] 转换为字符串 "病女,gl"
        alias_str = ",".join(alias_list)
        
        # 执行更新
        affected_rows = cursor.execute(sql, (alias_str, song_name))
        
        if affected_rows > 0:
            success_count += 1
        else:
            not_found_count += 1
            print(f"⚠️ 警告: 数据库中未找到曲目 '{song_name}' (请检查大小写和符号)，已跳过。")

    # 4. 提交并关闭
    conn.commit()
    cursor.close()
    conn.close()

    print("\n--- 导入完成 ---")
    print(f"✅ 成功为 {success_count} 首曲目更新了别名！")
    if not_found_count > 0:
        print(f"⚠️ 有 {not_found_count} 首曲目匹配失败。")

if __name__ == '__main__':
    sync_aliases_to_db()