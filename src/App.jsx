import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, Trash2, Trophy, LogOut, Loader2, UploadCloud, Download, Camera, Target, Activity, ChevronUp, ChevronDown, RotateCcw, Github } from 'lucide-react';

// ⚠️ 注意：本地部署时，请取消注释下面两行，并将假数据头像换回你的本地文件
import * as htmlToImage from 'html-to-image';
import myAvatar from './assets/partner/saya_awaken.png';
// import bgImage from './assets/background/bg.jpg';
// 假设你原来的横屏图是这样引入的：
import bgImage from './assets/background/bg-pc.jpg';
// 加上这行，引入你的竖屏图：
import bgMobileImage from './assets/background/bg-mobile.jpg';
// const myAvatar = 'https://ui-avatars.com/api/?name=Saya&background=4CAED1&color=fff';

const API_BASE_URL = '/api';

const DIFF_COLORS = {
  PST: '#4CAED1',
  PRS: '#94B15E',
  FTR: '#C2439A',
  ETR: '#957EB5',
  BYD: '#CF1436'
};

const formatScore = (score) => {
  const s = String(score).padStart(8, '0');
  return `${s.slice(0, 2)}'${s.slice(2, 5)}'${s.slice(5)}`;
};

// 🌟 辅助函数：单曲 PTT 计算
const calculateSinglePtt = (score, constant) => {
  if (typeof constant !== 'number' || constant === null) return 0;
  if (score >= 10000000) return constant + 2.0;
  if (score >= 9800000) return constant + 1.0 + (score - 9800000) / 200000;
  return Math.max(0, constant + (score - 9500000) / 300000);
};

// 🌟 辅助函数：目标分数反推
const calculateTargetScore = (targetPtt, constant) => {
  if (typeof constant !== 'number' || constant === null || isNaN(targetPtt)) return null;
  const diff = targetPtt - constant;
  if (diff >= 2.0) return 10000000;
  if (diff >= 1.0) return Math.ceil(9800000 + (diff - 1.0) * 200000);
  if (diff >= 0) return Math.ceil(9500000 + diff * 300000);
  return "< 9500000";
};

// 🌟 辅助函数：根据分数和物量估算 P F L
const estimatePFL = (score, notes) => {
  if (!notes || notes <= 0) return { p: '-', f: '-', l: '-' };
  const maxScore = 10000000 + notes;
  if (score >= maxScore) return { p: notes, f: 0, l: 0 };
  if (score < 0) return { p: 0, f: 0, l: 0 };

  const scoreDrop = maxScore - score;
  const singleNoteScore = 10000000 / notes;
  const costL = singleNoteScore + 1;
  const costF = singleNoteScore / 2 + 1;

  let bestDiff = Infinity;
  let bestF = 0;
  let bestL = 0;

  const maxL = Math.min(notes, Math.floor(scoreDrop / costL) + 1, 200);
  for (let l = 0; l <= maxL; l++) {
    const remainingDrop = scoreDrop - l * costL;
    if (remainingDrop < 0) {
      if (Math.abs(remainingDrop) < bestDiff) { bestDiff = Math.abs(remainingDrop); bestF = 0; bestL = l; }
      continue;
    }
    const f = Math.round(remainingDrop / costF);
    const diff = Math.abs(scoreDrop - (l * costL + f * costF));
    if (diff < bestDiff) { bestDiff = diff; bestF = f; bestL = l; }
  }

  let p = notes - bestF - bestL;
  return { p: Math.max(0, p), f: bestF, l: bestL };
};

// ==================== 管理员面板组件 ====================
const AdminDashboard = ({ token, userName, onLogout }) => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ totalSongs: 0 });
  const [activeTab, setActiveTab] = useState('users');

  const [songForm, setSongForm] = useState({
    name: '', PST: '', PRS: '', FTR: '', ETR: '', BYD: '',
    notes_pst: '', notes_prs: '', notes_ftr: '', notes_etr: '', notes_byd: '',
    cover_url: '', cover_url_byd: '', aliases: '', name_byd: ''
  });
  const [aliasForm, setAliasForm] = useState({ song_id: '', new_alias: '' });
  const [bydNameForm, setBydNameForm] = useState({ song_id: '', new_byd_name: '' });
  const [songDB, setSongDB] = useState([]);

  const [aliasSearchQuery, setAliasSearchQuery] = useState("");
  const [showAliasSuggestions, setShowAliasSuggestions] = useState(false);
  const aliasSearchRef = useRef(null);

  const [bydSearchQuery, setBydSearchQuery] = useState("");
  const [showBydSuggestions, setShowBydSuggestions] = useState(false);
  const bydSearchRef = useRef(null);

  useEffect(() => {
    fetchAdminData();
    fetchSongs();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (aliasSearchRef.current && !aliasSearchRef.current.contains(e.target)) {
        setShowAliasSuggestions(false);
      }
      if (bydSearchRef.current && !bydSearchRef.current.contains(e.target)) {
        setShowBydSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchAdminData = async () => {
    const res = await fetch(`${API_BASE_URL}/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
      setStats({ totalSongs: data.totalSongs });
    }
  };

  const fetchSongs = async () => {
    const res = await fetch(`${API_BASE_URL}/songs`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) setSongDB(await res.json());
  };

  const handleDeleteUser = async (id, name) => {
    if (!window.confirm(`警告：确定要彻底删除玩家 "${name}" 及其所有成绩记录吗？此操作不可逆！`)) return;
    const res = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) fetchAdminData();
  };

  const handleAddSong = async (e) => {
    e.preventDefault();
    const payload = { ...songForm };
    ['PST', 'PRS', 'FTR', 'ETR', 'BYD'].forEach(d => {
      payload[d] = payload[d] ? parseFloat(payload[d]) : null;
      const noteKey = `notes_${d.toLowerCase()}`;
      payload[noteKey] = payload[noteKey] ? parseInt(payload[noteKey], 10) : null;
    });

    const res = await fetch(`${API_BASE_URL}/admin/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      alert("添加成功！");
      setSongForm({
        name: '', name_byd: '', PST: '', PRS: '', FTR: '', ETR: '', BYD: '',
        notes_pst: '', notes_prs: '', notes_ftr: '', notes_etr: '', notes_byd: '',
        cover_url: '', cover_url_byd: '', aliases: ''
      });
      fetchSongs();
      fetchAdminData();
    } else {
      alert("添加失败，请检查曲名是否已存在。");
    }
  };

  const handleAddAlias = async (e) => {
    e.preventDefault();
    if (!aliasForm.song_id) return alert("请先选择曲目！");
    const res = await fetch(`${API_BASE_URL}/admin/songs/${aliasForm.song_id}/aliases`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ new_alias: aliasForm.new_alias })
    });
    if (res.ok) {
      alert("别名追加成功！");
      setAliasForm({ song_id: '', new_alias: '' });
      fetchSongs();
    }
  };

  const handleAddBydName = async (e) => {
    e.preventDefault();
    if (!bydNameForm.song_id) return alert("请先选择曲目！");
    const res = await fetch(`${API_BASE_URL}/admin/songs/${bydNameForm.song_id}/byd_name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name_byd: bydNameForm.new_byd_name })
    });
    if (res.ok) {
      alert("BYD特殊曲名更新成功！");
      setBydNameForm({ song_id: '', new_byd_name: '' });
      fetchSongs();
    } else {
      alert("更新失败，请重试。");
    }
  };

  const filteredAliasSongs = songDB.filter(song => {
    const query = aliasSearchQuery.toLowerCase();
    const matchName = song.name.toLowerCase().includes(query);
    const matchAlias = song.aliases && song.aliases.toLowerCase().includes(query);
    return matchName || matchAlias;
  });

  const filteredBydSongs = songDB.filter(song => {
    const query = bydSearchQuery.toLowerCase();
    const matchName = song.name.toLowerCase().includes(query);
    const matchAlias = song.aliases && song.aliases.toLowerCase().includes(query);
    return matchName || matchAlias;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-red-400">System Admin Control</h1>
            <p className="text-slate-400 mt-2">欢迎回来，最高管理员 | 当前曲库总量: {stats.totalSongs} 首</p>
          </div>
          <button onClick={onLogout} className="flex items-center text-slate-400 hover:text-red-400 bg-slate-800 px-4 py-2 rounded">
            <LogOut className="w-4 h-4 mr-2" /> 退出管理系统
          </button>
        </div>

        <div className="flex space-x-4 mb-6">
          <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded font-bold ${activeTab === 'users' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}>1. 账号管理</button>
          <button onClick={() => setActiveTab('addSong')} className={`px-4 py-2 rounded font-bold ${activeTab === 'addSong' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}>2. 添加新曲目</button>
          <button onClick={() => setActiveTab('aliases')} className={`px-4 py-2 rounded font-bold ${activeTab === 'aliases' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}>3. 追加别名</button>
          <button onClick={() => setActiveTab('bydName')} className={`px-4 py-2 rounded font-bold ${activeTab === 'bydName' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}>4. 增加BYD曲名</button>
        </div>

        {/* 账号管理和添加曲目的内容省略，保持原有逻辑 */}
        {activeTab === 'users' && (
          <div className="bg-slate-800 rounded-lg p-6 shadow-xl">
            <h2 className="text-xl mb-4 font-semibold text-white">平台注册玩家列表</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="p-3">ID</th>
                    <th className="p-3">用户名</th>
                    <th className="p-3">已录入成绩数</th>
                    <th className="p-3">注册时间</th>
                    <th className="p-3 text-right">危险操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-slate-700/50 hover:bg-slate-750">
                      <td className="p-3 text-slate-500">#{u.id}</td>
                      <td className="p-3 font-bold text-purple-300">{u.username} {u.username === 'admin' && '👑'}</td>
                      <td className="p-3">{u.score_count} 条</td>
                      <td className="p-3 text-sm text-slate-400">{new Date(u.created_at).toLocaleString()}</td>
                      <td className="p-3 text-right">
                        {u.username !== 'admin' && (
                          <button onClick={() => handleDeleteUser(u.id, u.username)} className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-3 py-1 rounded text-sm transition-colors">注销账号</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'addSong' && (
          <div className="bg-slate-800 rounded-lg p-6 shadow-xl max-w-4xl">
            <h2 className="text-xl mb-4 font-semibold text-white">收录新曲目入库</h2>
            <form onSubmit={handleAddSong} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">曲目名称 (英文主标题)</label>
                  <input required type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" value={songForm.name} onChange={e => setSongForm({ ...songForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-purple-300">BYD 特殊曲名 (可选)</label>
                  <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" placeholder="为空则使用原名" value={songForm.name_byd} onChange={e => setSongForm({ ...songForm, name_byd: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-5 gap-4 bg-slate-900/50 p-4 rounded border border-slate-700">
                {['PST', 'PRS', 'FTR', 'ETR', 'BYD'].map(diff => {
                  const noteKey = `notes_${diff.toLowerCase()}`;
                  return (
                    <div key={diff} className="space-y-3">
                      <div>
                        <label className="block text-slate-400 mb-1 text-sm">{diff} 定数</label>
                        <input type="number" step="0.1" className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white" placeholder="为空则无" value={songForm[diff]} onChange={e => setSongForm({ ...songForm, [diff]: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1 text-sm text-blue-300">{diff} 物量</label>
                        <input type="number" className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white" placeholder="总Notes数" value={songForm[noteKey]} onChange={e => setSongForm({ ...songForm, [noteKey]: e.target.value })} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">默认曲绘 URL</label>
                  <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" placeholder="https://..." value={songForm.cover_url} onChange={e => setSongForm({ ...songForm, cover_url: e.target.value })} />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-purple-300">BYD 特殊曲绘 URL (可选)</label>
                  <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" placeholder="为空则使用默认图" value={songForm.cover_url_byd} onChange={e => setSongForm({ ...songForm, cover_url_byd: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">初始别名 (逗号分隔)</label>
                <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" placeholder="例如: 骨折光,fr" value={songForm.aliases} onChange={e => setSongForm({ ...songForm, aliases: e.target.value })} />
              </div>
              <button type="submit" className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded mt-4">确认写入数据库</button>
            </form>
          </div>
        )}

        {activeTab === 'aliases' && (
          <div className="bg-slate-800 rounded-lg p-6 shadow-xl max-w-2xl border border-slate-700">
            <h2 className="text-xl mb-4 font-semibold text-white">为现有曲目追加搜索别名</h2>
            <form onSubmit={handleAddAlias} className="space-y-5">
              <div className="relative" ref={aliasSearchRef}>
                <label className="block text-slate-400 mb-1.5 text-sm">搜索并选择目标曲目</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="输入原名或任意别名搜索..."
                    value={aliasSearchQuery}
                    onChange={(e) => {
                      setAliasSearchQuery(e.target.value);
                      setAliasForm({ ...aliasForm, song_id: '' });
                      setShowAliasSuggestions(true);
                    }}
                    onFocus={() => setShowAliasSuggestions(true)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-red-400 transition-colors"
                  />
                </div>

                {showAliasSuggestions && aliasSearchQuery && (
                  <div className="absolute z-50 w-full mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl max-h-56 overflow-y-auto">
                    {filteredAliasSongs.length > 0 ? (
                      filteredAliasSongs.map(song => (
                        <div
                          key={song.id}
                          onClick={() => {
                            setAliasForm({ ...aliasForm, song_id: song.id });
                            setAliasSearchQuery(song.name);
                            setShowAliasSuggestions(false);
                          }}
                          className="px-4 py-3 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors"
                        >
                          <div className="text-white font-medium">{song.name}</div>
                          <div className="text-xs text-slate-400 mt-1 flex items-start">
                            <span className="bg-slate-900 px-1.5 py-0.5 rounded text-slate-500 mr-2 shrink-0 whitespace-nowrap">已有别名</span>
                            <span className="leading-tight">{song.aliases || '暂无'}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-4 text-sm text-slate-400 text-center">曲库中未找到对应曲目</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 text-sm">要追加的新别名</label>
                <input required type="text" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-red-400 transition-colors" placeholder="例如: 绿魔王 (不要带逗号)" value={aliasForm.new_alias} onChange={e => setAliasForm({ ...aliasForm, new_alias: e.target.value })} />
              </div>
              <button type="submit" className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold py-3.5 rounded-lg mt-6 shadow-lg transition-all active:scale-95">追加并保存到数据库</button>
            </form>
          </div>
        )}

        {activeTab === 'bydName' && (
          <div className="bg-slate-800 rounded-lg p-6 shadow-xl max-w-2xl border border-slate-700">
            <h2 className="text-xl mb-4 font-semibold text-white">为现有曲目增加 BYD 特殊曲名</h2>
            <form onSubmit={handleAddBydName} className="space-y-5">
              <div className="relative" ref={bydSearchRef}>
                <label className="block text-slate-400 mb-1.5 text-sm">搜索并选择目标曲目</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="输入原名或任意别名搜索..."
                    value={bydSearchQuery}
                    onChange={(e) => {
                      setBydSearchQuery(e.target.value);
                      setBydNameForm({ ...bydNameForm, song_id: '' });
                      setShowBydSuggestions(true);
                    }}
                    onFocus={() => setShowBydSuggestions(true)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-red-400 transition-colors"
                  />
                </div>

                {showBydSuggestions && bydSearchQuery && (
                  <div className="absolute z-50 w-full mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl max-h-56 overflow-y-auto">
                    {filteredBydSongs.length > 0 ? (
                      filteredBydSongs.map(song => (
                        <div
                          key={song.id}
                          onClick={() => {
                            setBydNameForm({ ...bydNameForm, song_id: song.id });
                            setBydSearchQuery(song.name);
                            setShowBydSuggestions(false);
                          }}
                          className="px-4 py-3 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors"
                        >
                          <div className="text-white font-medium">{song.name}</div>
                          <div className="text-xs text-slate-400 mt-1 flex flex-col items-start space-y-1">
                            {song.name_byd && (
                              <div className="flex items-center">
                                <span className="bg-purple-900/50 px-1.5 py-0.5 rounded text-purple-300 mr-2 shrink-0 whitespace-nowrap">现有 BYD 名</span>
                                <span className="leading-tight text-purple-200">{song.name_byd}</span>
                              </div>
                            )}
                            <div className="flex items-start">
                              <span className="bg-slate-900 px-1.5 py-0.5 rounded text-slate-500 mr-2 shrink-0 whitespace-nowrap">已有别名</span>
                              <span className="leading-tight">{song.aliases || '暂无'}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-4 text-sm text-slate-400 text-center">曲库中未找到对应曲目</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 text-sm">新的 BYD 特殊曲名</label>
                <input required type="text" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-red-400 transition-colors" placeholder="例如: Last | Eternity" value={bydNameForm.new_byd_name} onChange={e => setBydNameForm({ ...bydNameForm, new_byd_name: e.target.value })} />
              </div>
              <button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3.5 rounded-lg mt-6 shadow-lg transition-all active:scale-95">更新曲目 BYD 名称</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('arcaea_token') || null);
  const [isLoginMode, setIsLoginMode] = useState(true);

  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [songDB, setSongDB] = useState([]);
  const [scores, setScores] = useState([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSong, setSelectedSong] = useState(null);
  const [difficulty, setDifficulty] = useState("FTR");
  const [scoreInput, setScoreInput] = useState("");
  const [targetPttInput, setTargetPttInput] = useState("");

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const searchRef = useRef(null);
  const fileInputRef = useRef(null);
  const captureRef = useRef(null);

  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [hoveredCardId, setHoveredCardId] = useState(null);
  const [needsSort, setNeedsSort] = useState(false);

  const decodedToken = useMemo(() => {
    if (!token) return null;
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }, [token]);

  const userName = decodedToken?.username || "";
  const isAdmin = decodedToken?.isAdmin === true;

  // 🌟 核心：处理假定分数的模拟逻辑
  // const handleSimulateScore = (id, delta, maxScore) => {
  //   setScores(prev => {
  //     const updatedScores = prev.map(s => {
  //       if (s.id === id) {
  //         const originalScore = s.originalScore || s.score;
  //         let newScore = s.score + delta;
  //         if (newScore > maxScore) newScore = maxScore;
  //         if (newScore < 0) newScore = 0;

  //         return {
  //           ...s,
  //           score: newScore,
  //           ptt: calculateSinglePtt(newScore, s.constant),
  //           isSimulated: newScore !== originalScore,
  //           originalScore: originalScore
  //         };
  //       }
  //       return s;
  //     });
  //     // 模拟后需要重新根据 PTT 降序排序，挤压或提升 B30 的位置！
  //     return updatedScores.sort((a, b) => b.ptt - a.ptt);
  //   });
  // };

  // const handleResetSimulate = (id) => {
  //   setScores(prev => {
  //     const updatedScores = prev.map(s => {
  //       if (s.id === id && s.originalScore !== undefined) {
  //         return {
  //           ...s,
  //           score: s.originalScore,
  //           ptt: calculateSinglePtt(s.originalScore, s.constant),
  //           isSimulated: false
  //         };
  //       }
  //       return s;
  //     });
  //     return updatedScores.sort((a, b) => b.ptt - a.ptt);
  //   });
  // };
  const handleSimulateScore = (id, delta, maxScore) => {
    setScores(prev => {
      const updatedScores = prev.map(s => {
        if (s.id === id) {
          const originalScore = s.originalScore || s.score;
          let newScore = s.score + delta;
          if (newScore > maxScore) newScore = maxScore;
          if (newScore < 0) newScore = 0;

          return {
            ...s,
            score: newScore,
            ptt: calculateSinglePtt(newScore, s.constant),
            isSimulated: newScore !== originalScore,
            originalScore: originalScore
          };
        }
        return s;
      });
      return updatedScores; // 👈 这里去掉了 .sort(...)
    });
    setNeedsSort(true); // 👈 通知系统需要排序了
  };

  const handleResetSimulate = (id) => {
    setScores(prev => {
      const updatedScores = prev.map(s => {
        if (s.id === id && s.originalScore !== undefined) {
          return {
            ...s,
            score: s.originalScore,
            ptt: calculateSinglePtt(s.originalScore, s.constant),
            isSimulated: false
          };
        }
        return s;
      });
      return updatedScores; // 👈 这里去掉了 .sort(...)
    });
    setNeedsSort(true); // 👈 通知系统需要排序了
  };

  // 🌟 延后排序监听器
  useEffect(() => {
    if (needsSort && hoveredCardId === null) {
      setScores(prev => [...prev].sort((a, b) => b.ptt - a.ptt));
      setNeedsSort(false);
    }
  }, [needsSort, hoveredCardId]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonData = JSON.parse(event.target.result);
        setIsImporting(true);
        setErrorMsg("");

        const res = await fetch(`${API_BASE_URL}/scores/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(jsonData)
        });

        const data = await res.json();
        if (res.ok) {
          const scoresRes = await fetch(`${API_BASE_URL}/scores`, { headers: { 'Authorization': `Bearer ${token}` } });
          setScores(await scoresRes.json());
          alert(data.message);
        } else {
          setErrorMsg(data.error || "批量导入失败");
        }
      } catch (err) {
        console.error("详细错误信息:", err);
        setErrorMsg("JSON 文件解析失败，请确保格式正确。");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      { "song_name": "Testify", "difficulty": "BYD", "score": 10002221 },
      { "song_name": "Grievous Lady", "difficulty": "FTR", "score": 9951234 }
    ];

    const blob = new Blob([JSON.stringify(templateData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'arcaea_import_template.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!token) return;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [songsRes, scoresRes] = await Promise.all([
          fetch(`${API_BASE_URL}/songs`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${API_BASE_URL}/scores`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (scoresRes.status === 401 || scoresRes.status === 403 || songsRes.status === 401) {
          handleLogout();
          return;
        }

        setSongDB(await songsRes.json());
        setScores(await scoresRes.json());
      } catch (err) {
        setErrorMsg("无法连接到服务器，请检查后端运行状态。");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [token]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const endpoint = isLoginMode ? '/login' : '/register';

    try {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();

      if (!res.ok) return setAuthError(data.error || '请求失败');

      if (isLoginMode) {
        localStorage.setItem('arcaea_token', data.token);
        setToken(data.token);
      } else {
        setIsLoginMode(true);
        setAuthError("注册成功，请登录！");
      }
    } catch (err) {
      setAuthError("无法连接到服务器后端。");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('arcaea_token');
    setToken(null);
    setScores([]);
  };

  const handleExportImage = async () => {
    if (typeof htmlToImage === 'undefined' || !captureRef.current) return;
    setIsExporting(true);

    try {
      // DataURL conversion for reliable html-to-image backgrounds
      const getBase64Image = async (imgUrl) => {
        try {
          const res = await fetch(imgUrl);
          const blob = await res.blob();
          return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error("Failed to load bg image", e);
          return imgUrl;
        }
      };

      const filter = (node) => {
        if (node.tagName && node.getAttribute && node.getAttribute('data-html2canvas-ignore') === 'true') {
          return false;
        }
        return true;
      };

      // 增加画布宽度，确切留出左右边距，避免内容在边缘被无情裁切
      const captureWidth = 1860;
      const clone = captureRef.current.cloneNode(true);
      clone.style.width = `${captureWidth}px`;
      // clone.style.position = 'absolute';
      // clone.style.top = '-9999px';
      // clone.style.left = '-9999px';
      // clone.style.padding = '10px -5000px';

      const topGrid = clone.querySelector('#b30-grid-top');
      if (topGrid) topGrid.className = "grid grid-cols-3 gap-6";

      const overflowGrid = clone.querySelector('#b30-grid-overflow');
      if (overflowGrid) overflowGrid.className = "grid grid-cols-3 gap-6 opacity-80";

      const header = clone.querySelector('#b30-header');
      if (header) header.className = "max-w-[1100px] mx-auto mb-10 pt-4 flex flex-row items-start justify-between relative";

      const headerInfo = clone.querySelector('#b30-header-info');
      if (headerInfo) headerInfo.className = "flex flex-col items-start space-y-2 mt-0";

      document.body.appendChild(clone);
      const targetHeight = clone.scrollHeight;
      document.body.removeChild(clone);

      // B30成绩图是标志性的竖长图结构 (比例约 1:2.5)
      // 若使用电脑版的 16:9 宽屏壁纸进行竖向长图的 cover 拉伸，会引起强烈的放大和错位视觉感
      // 强行锁定使用专用于纵排列的手机版原画 (bgMobileImage)，完美契合长图排版并解决放大错位问题
      const actualBgImage = bgMobileImage;
      const bgDataUrl = await getBase64Image(actualBgImage);

      const dataUrl = await htmlToImage.toPng(captureRef.current, {
        quality: 1.0,
        pixelRatio: 2,
        width: captureWidth,
        height: targetHeight,
        imagePlaceholder: '',
        filter: filter,
        style: {
          width: `${captureWidth}px`,
          height: `${targetHeight}px`,
          padding: '40px 30px',
          backgroundImage: `url(${bgDataUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'top center',
          backgroundColor: '#0f172a',
        },
        onclone: (clonedNode) => {
          // 注意：onclone 传入的是根克隆节点 (HTMLElement)，没有 getElementById 方法，必须用 querySelector
          const qHeader = clonedNode.querySelector('#b30-header');
          if (qHeader) qHeader.className = "max-w-[1100px] mx-auto mb-10 pt-4 flex flex-row items-start justify-between relative";

          const qHeaderInfo = clonedNode.querySelector('#b30-header-info');
          if (qHeaderInfo) qHeaderInfo.className = "flex flex-col items-start space-y-2 mt-0";

          const qTopGrid = clonedNode.querySelector('#b30-grid-top');
          if (qTopGrid) qTopGrid.className = "grid grid-cols-3 gap-6";

          const qOverflowGrid = clonedNode.querySelector('#b30-grid-overflow');
          if (qOverflowGrid) qOverflowGrid.className = "grid grid-cols-3 gap-6 opacity-80";
        }
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `Arcaea_B30_${userName}_${new Date().getTime()}.png`;
      link.click();
    } catch (err) {
      console.error("导出图片失败:", err);
      alert("导出图片失败，请检查控制台。");
    } finally {
      setIsExporting(false);
    }
  };

  const handleAddScore = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!selectedSong) return setErrorMsg("请先选择曲目。");
    const numericScore = parseInt(scoreInput.replace(/['\s]/g, ''), 10);
    if (isNaN(numericScore) || numericScore < 0 || numericScore > 10002221) return setErrorMsg("成绩无效。");
    if (selectedSong.constants[difficulty] === null) return setErrorMsg(`该曲目不存在 ${difficulty} 难度。`);

    try {
      const res = await fetch(`${API_BASE_URL}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ song_id: selectedSong.id, difficulty, score: numericScore })
      });

      if (res.ok) {
        const scoresRes = await fetch(`${API_BASE_URL}/scores`, { headers: { 'Authorization': `Bearer ${token}` } });
        setScores(await scoresRes.json());
        setSearchQuery("");
        setSelectedSong(null);
        setScoreInput("");
      }
    } catch (err) {
      setErrorMsg("保存请求失败。");
    }
  };

  const handleDelete = async (scoreId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/scores/${scoreId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setScores(prev => prev.filter(s => s.id !== scoreId));
    } catch (err) {
      setErrorMsg("删除失败。");
    }
  };

  const stats = useMemo(() => {
    const top30 = scores.slice(0, 30);
    const overflow = scores.slice(30, 50);
    const top10 = scores.slice(0, 10);

    const sum30 = top30.reduce((acc, curr) => acc + curr.ptt, 0);
    const sum10 = top10.reduce((acc, curr) => acc + curr.ptt, 0);

    const hiddenCount = Math.max(0, scores.length - 50);
    const hasSimulated = scores.some(s => s.isSimulated);

    return {
      b30Avg: top30.length ? (sum30 / Math.max(top30.length, 30)).toFixed(4) : "0.0000",
      maxPtt: top30.length ? ((sum30 + sum10) / 40).toFixed(4) : "0.0000",
      top30,
      overflow,
      hiddenCount,
      hasSimulated
    };
  }, [scores]);

  const filteredSongs = songDB.filter(song => {
    const query = searchQuery.toLowerCase();
    const matchName = song.name.toLowerCase().includes(query);
    const matchAlias = song.aliases && song.aliases.toLowerCase().includes(query);
    return matchName || matchAlias;
  });

  const ScoreCard = ({ score, index }) => {
    const coverBaseUrl = `${API_BASE_URL.replace('/api', '')}/covers`;
    const defaultCover = `${coverBaseUrl}/${score.song_id}.jpg`;
    const bydCover = `${coverBaseUrl}/${score.song_id}_byd.jpg`;
    // const initialCover = score.difficulty === 'BYD' ? bydCover : defaultCover;
    const finalCover = (score.difficulty === 'BYD' && score.cover_url_byd) ? bydCover : defaultCover;

    // const [currentImage, setCurrentImage] = useState(initialCover);

    const displaySongName = (score.difficulty === 'BYD' && score.name_byd) ? score.name_byd : score.song_name;

    const pfl = estimatePFL(score.score, score.notes);

    // 🌟 计算此曲目的满分与每个 Far 扣除的分数，供模拟使用
    const maxScore = score.notes ? 10000000 + score.notes : 10002221;
    // Arcaea 中，Far 会丢失一半的基础分外加1个判定分（判定分为基础分+1的那个1，所以差值是 baseNoteScore / 2 + 1）
    // 简化：丢失分数大约为 (10000000 / notes) / 2 + 1
    const increment = score.notes ? Math.ceil((10000000 / score.notes) / 2) + 1 : null;

    return (
      <div className={`relative group bg-slate-800/80 border ${score.isSimulated ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-slate-700'} rounded-lg overflow-hidden shadow-lg hover:border-slate-500 transition-colors flex h-30`}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHoveredCardId(score.id); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHoveredCardId(null); }}
      >
        <div className={`absolute top-1 right-12 font-black text-sm italic z-10 ${score.isSimulated ? 'text-amber-500/70' : 'text-slate-500'}`}>#{index}</div>

        <div className="w-28 h-full bg-slate-900 flex-shrink-0 relative border-r border-slate-700">
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            {score.cover_url ? (
              <img
                src={finalCover}
                alt={displaySongName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // if (currentImage === bydCover) {
                  if (false) {
                    setCurrentImage(defaultCover);
                  }
                  else {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }
                }}
              />
            ) : null}
            <span className="text-slate-700 text-xs font-bold" style={{ display: score.cover_url ? 'none' : 'block' }}>NO COVER</span>
          </div>
          <div
            className="absolute top-5 right-0 w-2 h-7 transform translate-x-4 -translate-y-4 rotate-0 z-10"
            style={{ backgroundColor: DIFF_COLORS[score.difficulty] }}
          ></div>
        </div>

        <div className="flex-1 p-2 min-w-0 pl-5 pr-10 flex flex-col justify-between relative">
          <div className="w-full truncate pr-2">
            <h3 className="text-sm font-semibold text-slate-100 truncate" title={displaySongName}>
              {displaySongName}
            </h3>
          </div>

          <div>
            <p className={`text-2xl font-mono tracking-tight font-light mt-1 text-shadow-sm ${score.isSimulated ? 'text-amber-400 font-bold' : 'text-white'}`}>
              {formatScore(score.score)}
            </p>

            <div className="flex flex-col text-[0.65rem] mt-1 space-y-1 w-max">
              <div className={`px-2 py-0.5 rounded text-center ${score.isSimulated ? 'bg-amber-900/40 text-amber-200' : 'bg-slate-900 text-slate-300'}`}>
                Potential {score.constant.toFixed(1)} &gt; <span className={`font-bold ${score.isSimulated ? 'text-amber-400' : 'text-purple-300'}`}>{score.ptt.toFixed(4)}</span>
              </div>

              <div className={`flex items-center justify-between w-full px-2 py-0.5 rounded font-mono ${score.isSimulated ? 'bg-amber-900/20' : 'bg-slate-900/60'}`} title="基于分数的P/F/L近似估值">
                <span><span className="text-blue-300 font-bold">P</span> <span className={score.isSimulated ? 'text-amber-100' : 'text-slate-200'}>{pfl.p}</span></span>
                <span><span className="text-amber-400 font-bold">F</span> <span className={score.isSimulated ? 'text-amber-100' : 'text-slate-200'}>{pfl.f}</span></span>
                <span><span className="text-red-400 font-bold">L</span> <span className={score.isSimulated ? 'text-amber-100' : 'text-slate-200'}>{pfl.l}</span></span>
              </div>
            </div>
          </div>
          <button onClick={() => handleDelete(score.id)} className="absolute bottom-2 right-2 p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
        </div>

        {/* 🌟 用户要求的 侧边栏模拟按钮 */}
        <div className="w-8 flex-shrink-0 border-l border-slate-700 bg-slate-800/60 flex flex-col items-center justify-around py-1.5 shadow-inner z-10" data-html2canvas-ignore="true">
          <button onClick={() => increment && handleSimulateScore(score.id, increment, maxScore)} className="p-1 text-slate-400 hover:text-green-400 transition-colors" title="减少一个 Far，预览目标分数">
            <ChevronUp className="w-5 h-5" />
          </button>
          <button onClick={() => handleResetSimulate(score.id)} className={`p-1 transition-colors ${score.isSimulated ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 cursor-not-allowed'}`} disabled={!score.isSimulated} title="重置分数">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => increment && handleSimulateScore(score.id, -increment, maxScore)} className="p-1 text-slate-400 hover:text-red-400 transition-colors" title="增加一个 Far，预览降分表现">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/80 border border-slate-700 p-8 rounded-2xl shadow-2xl w-full max-w-md backdrop-blur-md">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-sm border border-purple-300 overflow-hidden shadow-[0_0_15px_rgba(168,85,247,0.5)] flex-shrink-0">
              <img src={myAvatar} alt="My Avatar" className="w-full h-full object-cover" />
            </div>
          </div>
          <h2 className="text-2xl font-light text-center text-slate-100 mb-8 uppercase tracking-widest">
            Arcaea <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-400">Tracker</span>
          </h2>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <input type="text" placeholder="账号用户名" required className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-purple-400 transition-colors" value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} />
            </div>
            <div>
              <input type="password" placeholder="密码" required className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-purple-400 transition-colors" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} />
            </div>
            {authError && <p className="text-red-400 text-sm text-center">{authError}</p>}

            <button type="submit" disabled={authLoading} className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-medium shadow-lg transition-all active:scale-95 flex justify-center items-center">
              {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLoginMode ? '登录到我的 B30' : '创建新账号')}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-400">
            {isLoginMode ? '还没有账号？' : '已有账号？'}
            <button type="button" onClick={() => { setIsLoginMode(!isLoginMode); setAuthError(''); }} className="ml-2 text-purple-400 hover:text-purple-300 font-medium">
              {isLoginMode ? '立即注册' : '返回登录'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return <AdminDashboard token={token} userName={userName} onLogout={handleLogout} />;
  }

  // ===================== 渲染主程序 =====================
  return (
    <div className="min-h-screen relative">
      {/* 【新增】：把背景单独抽离出来作为一个固定在底部的层
        使用 fixed inset-0 铺满屏幕，-z-10 沉在最底下
      */}
      <div
        className="fixed inset-0 bg-cover bg-center -z-10 bg-[image:var(--bg-mobile)] md:bg-[image:var(--bg-pc)]"
        style={{
          '--bg-pc': `url(${bgImage})`,
          '--bg-mobile': `url(${bgMobileImage})`
        }}
      ></div>

      {/* 【修改】：原来的内容层
        去掉了背景图相关的 class 和 style，只保留 padding 和内容相关的样式 
      */}
      <div
        ref={captureRef}
        className="p-4 md:p-8 min-h-screen relative text-slate-100 font-sans"
      >
        <div className="absolute inset-0 bg-slate-900/60 pointer-events-none z-0"></div>
        <div id="b30-header" className="max-w-[1100px] mx-auto mb-10 pt-4 flex flex-col md:flex-row items-center md:items-start justify-between relative">

          <div className="absolute top-0 right-0 flex space-x-2" data-html2canvas-ignore="true">
            <a href="https://github.com/ponder-j/Arcaea-b30-Local-Tracker" target="_blank" rel="noopener noreferrer" className="flex items-center text-slate-400 hover:text-blue-400 transition-colors text-sm px-3 py-1 rounded-md hover:bg-slate-800/50">
              <Github className="w-4 h-4 mr-2" /> 项目链接
            </a>
            <button
              onClick={handleExportImage}
              disabled={isExporting}
              className="flex items-center text-purple-400 hover:text-purple-300 transition-colors text-sm px-3 py-1 rounded-md hover:bg-slate-800/50 disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
              {isExporting ? '生成中...' : '生成 B30 图片'}
            </button>
            <button onClick={handleLogout} className="flex items-center text-slate-400 hover:text-red-400 transition-colors text-sm px-3 py-1 rounded-md hover:bg-slate-800/50">
              <LogOut className="w-4 h-4 mr-2" /> 退出登录
            </button>
          </div>

          <div id="b30-header-info" className="flex flex-col items-center md:items-start space-y-2 mt-8 md:mt-0">
            <div className="flex items-center space-x-3">
              <h1 className="text-4xl tracking-widest font-light uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-purple-300">Player Bests</h1>
            </div>

            <div className="flex items-center space-x-4 mt-6">
              <div className="w-16 h-16 rounded-sm border border-purple-300 overflow-hidden shadow-[0_0_15px_rgba(168,85,247,0.5)] flex-shrink-0">
                <img src={myAvatar} alt="My Avatar" className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="bg-transparent text-2xl font-medium tracking-wide border-b border-dashed border-slate-600 pb-1 w-48 truncate">{userName}</div>
                <p className="text-slate-400 text-sm tracking-wider mt-1">Darkest night, I'll confront you here....</p>
              </div>
            </div>

            <div className="flex space-x-8 mt-6">
              <div>
                <p className="text-xs tracking-wider text-slate-400 font-semibold mb-1">
                  BEST TOP30 AVG. {stats.hasSimulated && <span className="text-amber-400 ml-1">(PREVIEW)</span>}
                </p>
                <p className={`text-2xl font-mono ${stats.hasSimulated ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : ''}`}>{stats.b30Avg}</p>
              </div>
              <div>
                <p className="text-xs tracking-wider text-slate-400 font-semibold mb-1">
                  MAX POTENTIAL {stats.hasSimulated && <span className="text-amber-400 ml-1">(PREVIEW)</span>}
                </p>
                <p className={`text-2xl font-mono ${stats.hasSimulated ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : ''}`}>{stats.maxPtt}</p>
              </div>
            </div>
          </div>
        </div>

        <div
          data-html2canvas-ignore="true"
          className="relative z-50 max-w-[1100px] mx-auto bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-12 backdrop-blur-md shadow-xl"
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center"><Plus className="w-5 h-5 mr-2" /> 添加成绩 (数据库共有 {songDB.length} 首曲目)</h2>
          <form onSubmit={handleAddScore} className="flex flex-col md:flex-row gap-4 items-start md:items-center">

            <div className="relative w-full md:w-64" ref={searchRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="搜索曲目..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setSelectedSong(null); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-purple-400 transition-colors" />
              </div>

              {showSuggestions && searchQuery && (
                <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {filteredSongs.length > 0 ? (
                    filteredSongs.map(song => (
                      <div key={song.id} onClick={() => { setSelectedSong(song); setSearchQuery(song.name); setShowSuggestions(false); }} className="px-4 py-2 hover:bg-slate-700 cursor-pointer text-sm">
                        {song.name}
                      </div>
                    ))
                  ) : <div className="px-4 py-2 text-sm text-slate-400">未找到对应曲目</div>}
                </div>
              )}
            </div>

            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full md:w-28 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-purple-400 transition-colors cursor-pointer appearance-none">
              {['PST', 'PRS', 'FTR', 'ETR', 'BYD'].map(diff => (
                <option key={diff} value={diff} disabled={selectedSong && selectedSong.constants[diff] === null}>
                  {diff} {selectedSong && selectedSong.constants[diff] !== null ? `(${selectedSong.constants[diff]})` : ''}
                </option>
              ))}
            </select>

            <input type="number" placeholder="成绩 (例如: 9962055)" value={scoreInput} onChange={(e) => setScoreInput(e.target.value)} className="w-full md:w-56 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-purple-400 transition-colors" />

            <div className="flex flex-col md:flex-row w-full md:w-auto gap-2">
              <button type="submit" className="w-full md:w-auto px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-medium shadow-lg transition-all active:scale-95 whitespace-nowrap">
                保存成绩
              </button>
              <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button type="button" disabled={isImporting} onClick={() => fileInputRef.current?.click()} className="w-full md:w-auto px-4 py-2.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 rounded-lg font-medium shadow transition-all active:scale-95 flex items-center justify-center whitespace-nowrap">
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                {isImporting ? '导入中...' : '批量导入'}
              </button>
              <button type="button" onClick={handleDownloadTemplate} className="w-full md:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg font-medium shadow transition-all active:scale-95 flex items-center justify-center whitespace-nowrap">
                <Download className="w-4 h-4 mr-2" />
                下载模板
              </button>
            </div>
          </form>

          {selectedSong && (
            <div className="mt-5 p-4 bg-slate-900/40 rounded-lg border border-slate-600/50 flex flex-col md:flex-row gap-6">
              <div className="flex-1 flex flex-col justify-center border-b md:border-b-0 md:border-r border-slate-700/50 pb-4 md:pb-0 md:pr-4">
                <h3 className="text-sm font-semibold text-blue-300 flex items-center mb-2"><Activity className="w-4 h-4 mr-1" /> 实时 PTT 预览</h3>
                <div className="text-slate-400 text-sm flex items-center">
                  该曲目定数: <span className="font-mono text-white ml-1 mr-3">{selectedSong.constants[difficulty]?.toFixed(1) || 'N/A'}</span>
                  打出分 <span className="font-mono text-white mx-1">{scoreInput || '0'}</span> 将获得:
                  <span className="ml-2 text-lg font-bold text-blue-400 bg-blue-900/30 px-2 rounded">
                    {scoreInput ? calculateSinglePtt(parseInt(scoreInput, 10), selectedSong.constants[difficulty]).toFixed(4) : '0.0000'}
                  </span>
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center pl-0 md:pl-2">
                <h3 className="text-sm font-semibold text-amber-300 flex items-center mb-2"><Target className="w-4 h-4 mr-1" /> 目标分数反推</h3>
                <div className="flex items-center gap-3">
                  <input type="number" step="0.01" placeholder="输入你想达到的 PTT (例: 11.5)" value={targetPttInput} onChange={e => setTargetPttInput(e.target.value)} className="w-48 bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400 transition-colors" />
                  <span className="text-slate-400 text-sm">需达成:</span>
                  <span className="text-lg font-bold text-amber-400 font-mono tracking-tight">
                    {targetPttInput ? formatScore(calculateTargetScore(parseFloat(targetPttInput), selectedSong.constants[difficulty])) : '---'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {errorMsg && <p className="text-red-400 mt-3 text-sm">{errorMsg}</p>}
        </div>

        <div className="max-w-[1100px] mx-auto">
          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div>
          ) : (
            <>
              <div id="b30-grid-top" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stats.top30.map((score, index) => (
                  <ScoreCard key={`${score.id}-${score.difficulty}`} score={score} index={index + 1} />
                ))}
                {stats.top30.length === 0 && (
                  <div className="col-span-full py-20 text-center text-slate-500">
                    <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>暂无成绩记录。请使用上方表单添加你的游玩记录！</p>
                  </div>
                )}
              </div>

              {stats.overflow.length > 0 && (
                <div className="mt-12 mb-6">
                  <div className="flex items-center mb-6">
                    <div className="flex-grow border-t border-dashed border-slate-600"></div>
                    <span className="mx-4 text-slate-400 font-bold tracking-[0.2em] uppercase text-sm drop-shadow-md">Overflow</span>
                    <div className="flex-grow border-t border-dashed border-slate-600"></div>
                  </div>

                  <div id="b30-grid-overflow" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-80">
                    {stats.overflow.map((score, index) => (
                      <ScoreCard key={`${score.id}-${score.difficulty}`} score={score} index={index + 31} />
                    ))}
                  </div>

                  {stats.hiddenCount > 0 && (
                    <div className="text-center mt-8 mb-4 text-slate-500 text-sm tracking-widest font-medium">
                      ... {stats.hiddenCount} 条成绩未显示 ...
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}