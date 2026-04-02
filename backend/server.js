require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

app.use(cors());
app.use(express.json());

// 🛡️ JSON 语法异常拦截器 (结合副本安全修复)
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.warn('⚠️ 拦截到恶意的畸形 JSON 请求:', req.ip);
        return res.status(400).json({ error: '无效的 JSON 请求格式' });
    }
    next(err);
});

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'arcaea_user',
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'arcaea_tracker'
});

app.use(express.static(path.join(__dirname, 'dist')));
app.use('/covers', express.static(path.join(__dirname, 'covers')));

// ================== 中间件 ==================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权访问' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token 无效或已过期' });
        // 适配副本：为了保持兼容性，使用 userId 和 id 同时指向
        req.user = { ...user, userId: user.id || user.userId };
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: '需要管理员权限' });
    next();
};

// ================== 认证路由 ==================
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || username.length < 3) return res.status(400).json({ error: '用户名或密码无效' });

    try {
        // 结合副本判断重名
        const [existingUsers] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) return res.status(400).json({ error: '该用户名已被注册' });

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashedPassword]);
        res.status(201).json({ message: '注册成功' });
    } catch (err) {
        res.status(500).json({ error: '服务器内部错误' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) return res.status(400).json({ error: '用户不存在' });

        const user = users[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(400).json({ error: '密码错误' });

        // 🛡️ 服务端签发 Token 注入 isAdmin 标识
        const isAdmin = user.username === 'admin';
        const token = jwt.sign({ id: user.id, username: user.username, isAdmin }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, message: '登录成功' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// ================== 曲目路由 ==================
// 🛡️ 结合副本：禁止匿名者拉取接口
app.get('/api/songs', authenticateToken, async (req, res) => {
    try {
        // 🌟 结合了主版的 name_byd, cover_url 且 补充了副本的 notes 物量系列
        const [rows] = await pool.query(`
            SELECT id, name, name_byd, PST, PRS, FTR, ETR, BYD, cover_url, cover_url_byd, aliases, 
                   notes_pst, notes_prs, notes_ftr, notes_etr, notes_byd 
            FROM songs
        `);

        const formatted = rows.map(song => ({
            id: song.id,
            name: song.name,
            name_byd: song.name_byd,
            cover_url: song.cover_url,
            cover_url_byd: song.cover_url_byd,
            aliases: song.aliases,
            constants: {
                PST: song.PST, PRS: song.PRS, FTR: song.FTR, ETR: song.ETR, BYD: song.BYD
            },
            notes: {
                PST: song.notes_pst, PRS: song.notes_prs, FTR: song.notes_ftr, ETR: song.notes_etr, BYD: song.notes_byd
            }
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// ================== 成绩路由 ==================
const calculatePtt = (constant, score) => {
    if (typeof constant !== 'number' || constant === null) return 0;
    if (score >= 10000000) return constant + 2.0;
    if (score >= 9800000) return constant + 1.0 + (score - 9800000) / 200000;
    return Math.max(0, constant + (score - 9500000) / 300000);
};

app.get('/api/scores', authenticateToken, async (req, res) => {
    try {
        // 🌟 联表时不仅取回原版的额外封面字段，还需要取回对应的物量 notes，供前端推导 PFL
        const [rows] = await pool.query(`
            SELECT 
                scores.id, scores.song_id, scores.difficulty, scores.score, 
                songs.name AS song_name, songs.name_byd, 
                songs.PST, songs.PRS, songs.FTR, songs.ETR, songs.BYD, 
                songs.cover_url, songs.cover_url_byd,
                songs.notes_pst, songs.notes_prs, songs.notes_ftr, songs.notes_etr, songs.notes_byd
            FROM scores 
            JOIN songs ON scores.song_id = songs.id 
            WHERE scores.user_id = ? 
            ORDER BY scores.score DESC
        `, [req.user.userId]);

        const scoredData = rows.map(row => {
            const difficulty = row.difficulty;
            const constant = row[difficulty];

            // 依据难度匹配对应的物量，发送给前端
            const notesMap = { PST: row.notes_pst, PRS: row.notes_prs, FTR: row.notes_ftr, ETR: row.notes_etr, BYD: row.notes_byd };
            const currentNotes = notesMap[difficulty] || 0;

            return {
                ...row,
                constant: constant || 0,
                notes: currentNotes,
                ptt: calculatePtt(constant, row.score)
            };
        }).sort((a, b) => b.ptt - a.ptt);

        res.json(scoredData);
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/scores', authenticateToken, async (req, res) => {
    const { song_id, difficulty, score } = req.body;
    if (!song_id || !difficulty || typeof score !== 'number') return res.status(400).json({ error: '参数无效' });

    try {
        await pool.query(
            'INSERT INTO scores (user_id, song_id, difficulty, score, timestamp) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE score = GREATEST(score, VALUES(score))',
            [req.user.userId, song_id, difficulty, score, Date.now()]
        );
        res.status(201).json({ message: '成绩保存成功' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/scores/bulk', authenticateToken, async (req, res) => {
    const scoresArray = req.body;
    if (!Array.isArray(scoresArray)) return res.status(400).json({ error: '数据格式错误，期望为 JSON 数组' });

    let successCount = 0;
    try {
        for (const item of scoresArray) {
            const [songs] = await pool.query('SELECT id FROM songs WHERE name = ?', [item.song_name]);
            if (songs.length > 0) {
                await pool.query(
                    'INSERT INTO scores (user_id, song_id, difficulty, score, timestamp) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE score = GREATEST(score, VALUES(score))',
                    [req.user.userId, songs[0].id, item.difficulty, item.score, Date.now()]
                );
                successCount++;
            }
        }
        res.json({ message: `成功导入 ${successCount} 条成绩！` });
    } catch (err) {
        res.status(500).json({ error: '批量导入中断' });
    }
});

app.delete('/api/scores/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM scores WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId]);
        res.json({ message: '删除成功' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// ================== 管理员路由 ==================
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [users] = await pool.query(`
            SELECT users.id, users.username, users.created_at, COUNT(scores.id) as score_count 
            FROM users LEFT JOIN scores ON users.id = scores.user_id 
            GROUP BY users.id
        `);
        const [songCount] = await pool.query('SELECT COUNT(*) as count FROM songs');
        res.json({ users, totalSongs: songCount[0].count });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM scores WHERE user_id = ?', [req.params.id]);
        await pool.query('DELETE FROM users WHERE id = ? AND username != "admin"', [req.params.id]);
        res.json({ message: '用户已删除' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/admin/songs', authenticateToken, requireAdmin, async (req, res) => {
    if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: '非法的请求' });

    // 🌟 接收所有的主曲目信息 和 所有的 notes 信息
    const {
        name, name_byd, PST, PRS, FTR, ETR, BYD,
        notes_pst, notes_prs, notes_ftr, notes_etr, notes_byd,
        cover_url, cover_url_byd, aliases
    } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: '曲名不合法' });

    try {
        // 🌟 写入全部数据
        await pool.query(
            `INSERT INTO songs 
            (name, name_byd, PST, PRS, FTR, ETR, BYD, notes_pst, notes_prs, notes_ftr, notes_etr, notes_byd, cover_url, cover_url_byd, aliases) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name, name_byd || null,
                PST || null, PRS || null, FTR || null, ETR || null, BYD || null,
                notes_pst || null, notes_prs || null, notes_ftr || null, notes_etr || null, notes_byd || null,
                cover_url || '', cover_url_byd || '', aliases || ''
            ]
        );
        res.status(201).json({ message: '新曲目添加成功！' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '曲名重复' });
        throw err;
    }
});

app.put('/api/admin/songs/:id/aliases', authenticateToken, requireAdmin, async (req, res) => {
    const { new_alias } = req.body || {};
    if (!new_alias || typeof new_alias !== 'string') return res.status(400).json({ error: '别名不合法' });
    try {
        await pool.query("UPDATE songs SET aliases = CONCAT_WS(',', NULLIF(aliases, ''), ?) WHERE id = ?", [new_alias, req.params.id]);
        res.json({ message: '别名追加成功' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.put('/api/admin/songs/:id/byd_name', authenticateToken, requireAdmin, async (req, res) => {
    const { name_byd } = req.body || {};
    if (!name_byd || typeof name_byd !== 'string') return res.status(400).json({ error: 'BYD曲名不合法' });
    try {
        await pool.query("UPDATE songs SET name_byd = ? WHERE id = ?", [name_byd, req.params.id]);
        res.json({ message: 'BYD曲名修改成功' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// 🛡️ 全局捕获拦截器 (彻底修复 VULN-D)
app.use((err, req, res, next) => {
    console.error('🚨 [安全拦截 - 服务器内部异常]:', err.message);
    res.status(500).json({ error: '服务器内部错误，已被安全拦截' });
});

// 处理前端路由降级
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`后端服务器已启动，端口: ${PORT}`));