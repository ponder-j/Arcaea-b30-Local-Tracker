require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function start() {
    // 1. 连接数据库
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'arcaea_user',
        password: process.env.DB_PASS,
        database: process.env.DB_NAME || 'arcaea_tracker'
    });

    // 核心修改1：同时查询 cover_url 和 cover_url_byd 字段
    const [songs] = await pool.query('SELECT id, cover_url, cover_url_byd FROM songs WHERE cover_url IS NOT NULL OR cover_url_byd IS NOT NULL');
    
    // 2. 在后端根目录创建一个 covers 文件夹用来存图片
    const coversDir = path.join(__dirname, 'covers');
    if (!fs.existsSync(coversDir)) {
        fs.mkdirSync(coversDir);
    }

    console.log(`发现 ${songs.length} 首需要下载曲绘的曲目，开始批量下载...`);

    // 3. 遍历下载图片（分别处理普通曲绘和 Beyond 曲绘）
    for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        
        // --- 核心修改2：下载普通曲绘 ---
        if (song.cover_url) {
            const destPathNormal = path.join(coversDir, `${song.id}.jpg`);
            
            if (fs.existsSync(destPathNormal)) {
                console.log(`[${i+1}/${songs.length}] 曲目 ID ${song.id} 的普通曲绘已存在，跳过。`);
            } else {
                try {
                    const res = await fetch(song.cover_url);
                    if (!res.ok) throw new Error(`HTTP 状态码: ${res.status}`);
                    const arrayBuffer = await res.arrayBuffer();
                    fs.writeFileSync(destPathNormal, Buffer.from(arrayBuffer));
                    console.log(`[${i+1}/${songs.length}] ✅ 成功下载普通曲绘 ID: ${song.id}`);
                } catch (err) {
                    console.error(`[${i+1}/${songs.length}] ❌ 下载普通曲绘失败 (ID: ${song.id}):`, err.message);
                }
            }
        }

        // --- 核心修改3：下载 Beyond 曲绘 ---
        if (song.cover_url_byd) {
            const destPathByd = path.join(coversDir, `${song.id}_byd.jpg`);
            
            if (fs.existsSync(destPathByd)) {
                console.log(`[${i+1}/${songs.length}] 曲目 ID ${song.id} 的 Beyond 曲绘已存在，跳过。`);
            } else {
                try {
                    const res = await fetch(song.cover_url_byd);
                    if (!res.ok) throw new Error(`HTTP 状态码: ${res.status}`);
                    const arrayBuffer = await res.arrayBuffer();
                    fs.writeFileSync(destPathByd, Buffer.from(arrayBuffer));
                    console.log(`[${i+1}/${songs.length}] ✅ 成功下载 Beyond 曲绘 ID: ${song.id}`);
                } catch (err) {
                    console.error(`[${i+1}/${songs.length}] ❌ 下载 Beyond 曲绘失败 (ID: ${song.id}):`, err.message);
                }
            }
        }
    }

    console.log('🎉 所有曲绘处理完毕！');
    process.exit(0);
}

start();