import csv
import json
import os

def generate_bulk_import_json(input_csv='arcaea_constants.csv', output_json='arcaea_bulk_perfect.json'):
    records = []
    
    if not os.path.exists(input_csv):
        print(f"❌ 未找到输入文件 {input_csv}，请确保它和本脚本在同一目录下。")
        return

    print(f"开始读取 {input_csv} 并生成满分记录...")
    
    try:
        # 使用 utf-8-sig 以兼容可能带有 BOM 的 CSV 文件
        with open(input_csv, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            
            for row in reader:
                song_name = row.get('曲目名称', '').strip()
                difficulty = row.get('难度', '').strip()
                
                # 跳过空数据或未知难度
                if not song_name or not difficulty or difficulty == '未知':
                    continue
                
                # 组装符合批量导入接口格式的 JSON 对象
                # 10000000 为 Arcaea 基础满分 (Pure Memory)
                # 如果你想测试绝对理论值 (带大P)，也可以改为 10002221
                records.append({
                    "song_name": song_name,
                    "difficulty": difficulty,
                    "score": 10000000 
                })
                
    except Exception as e:
        print(f"❌ 读取或解析 CSV 时发生错误: {e}")
        return

    # 将生成的记录列表保存为 JSON 文件
    try:
        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
            
        print(f"🎉 成功生成！共提取了 {len(records)} 条谱面记录。")
        print(f"📁 满分成绩单已保存至: {output_json}")
        print("💡 现在你可以去前端网页使用 [批量导入] 按钮上传这个 JSON 文件了！")
        
    except Exception as e:
        print(f"❌ 保存 JSON 文件时发生错误: {e}")

if __name__ == '__main__':
    generate_bulk_import_json()