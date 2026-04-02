# import json
# import pymysql

# # --- 数据库配置 (请修改为你的密码) ---
# DB_CONFIG = {
#     'host': 'localhost',
#     'user': 'arcaea_user',       # 使用你的专属账号
#     'password': 'YOUR_PASSWORD', # <-- 填入你给 arcaea_user 设置的密码
#     'database': 'arcaea_tracker',
#     'charset': 'utf8mb4'
# }

# def sync_covers_to_db(json_filename='arcaea_covers.json'):
#     # 1. 读取 JSON 文件
#     try:
#         with open(json_filename, 'r', encoding='utf-8') as f:
#             covers_dict = json.load(f)
#     except FileNotFoundError:
#         print(f"❌ 找不到文件 {json_filename}，请确认路径是否正确。")
#         return

#     # 2. 连接数据库
#     try:
#         conn = pymysql.connect(**DB_CONFIG)
#         cursor = conn.cursor()
#     except Exception as e:
#         print(f"❌ 数据库连接失败: {e}")
#         return

#     # 3. 执行 UPDATE 操作
#     sql = "UPDATE songs SET cover_url = %s WHERE name LIKE %s"
    
#     success_count = 0
#     not_found_count = 0

#     print("开始将曲绘链接写入数据库...")
#     for song_name, cover_url in covers_dict.items():
#         # 执行更新
#         affected_rows = cursor.execute(sql, (cover_url, song_name + '%'))
        
#         if affected_rows > 0:
#             success_count += 1
#         else:
#             not_found_count += 1
#             # 可以取消下面这行的注释来查看哪些曲名没有匹配上
#             print(f"⚠️ 警告: 数据库中未找到曲目 '{song_name}'，已跳过。")

#     # 4. 提交事务并关闭连接
#     conn.commit()
#     cursor.close()
#     conn.close()

#     print("\n--- 执行完毕 ---")
#     print(f"✅ 成功更新了 {success_count} 首曲目的曲绘！")
#     if not_found_count > 0:
#         print(f"⚠️ 有 {not_found_count} 首曲目在数据库中未找到匹配项。")
#         print("   (这通常是因为维基上的曲名和定数表里的曲名写法有微小差异)")

# if __name__ == '__main__':
#     sync_covers_to_db()
import json
import pymysql

# --- 数据库配置 (请修改为你的密码) ---
DB_CONFIG = {
    'host': 'localhost',
    'user': 'arcaea_user',       # 使用你的专属账号
    'password': 'YOUR_PASSWORD', # <-- 填入你给 arcaea_user 设置的密码
    'database': 'arcaea_tracker',
    'charset': 'utf8mb4'
}

def sync_covers_to_db(json_filename='arcaea_covers_full.json'):
    # 1. 读取 JSON 文件
    try:
        with open(json_filename, 'r', encoding='utf-8') as f:
            covers_dict = json.load(f)
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

    # 3. 执行 UPDATE 操作
    success_count = 0
    not_found_count = 0

    print("开始将曲绘链接写入数据库...")
    for song_name, cover_url in covers_dict.items():
        # --- 核心修改区 ---
        # 判断是否为 Beyond 专属曲绘
        if song_name.endswith(" (Beyond)"):
            real_song_name = song_name[:-9]  # 截取掉 " (Beyond)" 得到真实曲名
            sql = "UPDATE songs SET cover_url_byd = %s WHERE name LIKE %s"
        else:
            real_song_name = song_name       # 普通曲目名不变
            sql = "UPDATE songs SET cover_url = %s WHERE name LIKE %s"
        # -------------------
        
        # 先查询数据库中是否存在该曲目
        check_sql = "SELECT 1 FROM songs WHERE name LIKE %s LIMIT 1"
        cursor.execute(check_sql, (real_song_name + '%',))
        
        # fetchone() 如果有数据说明曲目存在，执行无条件覆盖更新
        if cursor.fetchone():
            cursor.execute(sql, (cover_url, real_song_name + '%'))
            success_count += 1
        else:
            not_found_count += 1
            # 打印警告时，把真实曲名和原键名都展示出来方便排查
            print(f"⚠️ 警告: 数据库中未找到曲目 '{real_song_name}' (原键名: '{song_name}')，已跳过。")

    # 4. 提交事务并关闭连接
    conn.commit()
    cursor.close()
    conn.close()

    print("\n--- 执行完毕 ---")
    print(f"✅ 成功更新了 {success_count} 条曲绘记录（包含普通及Beyond曲绘）！")
    if not_found_count > 0:
        print(f"⚠️ 有 {not_found_count} 条记录在数据库中未找到匹配项。")
        print("   (这通常是因为维基上的曲名和定数表里的曲名写法有微小差异)")

if __name__ == '__main__':
    sync_covers_to_db()