// server.js — HBAO KEY API BACKEND
// mod made by hbao

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

// ====== MIDDLEWARE ======
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));
app.use(express.json());
app.options('*', (req, res) => res.sendStatus(200));

// ====== STORAGE ======
const DB_FILE = path.join(__dirname, 'keys.json');

function loadKeys() {
  try {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) { return {}; }
}
function saveKeys(keys) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(keys, null, 2)); }
  catch (e) { console.error('Save error:', e); }
}

// ====== DURATIONS ======
const DURATIONS = {
  '1m':   60 * 1000,
  '1h':   60 * 60 * 1000,
  '24h':  24 * 60 * 60 * 1000,
  '7d':   7 * 24 * 60 * 60 * 1000,
  '30d':  30 * 24 * 60 * 60 * 1000,
  '365d': 365 * 24 * 60 * 60 * 1000
};
const DURATION_LABEL = {
  '1m':  '1 PHÚT',
  '1h':  '1 TIẾNG',
  '24h': '24 GIỜ',
  '7d':  '7 NGÀY',
  '30d': '1 THÁNG',
  '365d':'1 NĂM'
};

// ====== API: TẠO KEY ======
app.post('/api/generate', (req, res) => {
  try {
    const { duration } = req.body || {};
    if (!DURATIONS[duration]) {
      return res.status(400).json({ message: 'Thời hạn không hợp lệ' });
    }
    const rand = (n) => {
      let s = '';
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    };
    const key = 'HBAO-' + rand(4) + '-' + rand(5);

    const keys = loadKeys();
    keys[key] = {
      key: key,
      duration: duration,
      durationLabel: DURATION_LABEL[duration],
      durationMs: DURATIONS[duration],
      slots: 1,
      deviceId: null,
      deviceInfo: null,
      activatedAt: null,
      expiresAt: null,
      createdAt: Date.now(),
      status: 'unused'
    };
    saveKeys(keys);
    res.json({ ok: true, key: key, duration: DURATION_LABEL[duration] });
  } catch (e) {
    res.status(500).json({ message: 'Lỗi server: ' + e.message });
  }
});

// ====== API: DANH SÁCH KEY ======
app.get('/api/keys', (req, res) => {
  try {
    const keys = loadKeys();
    res.json(Object.values(keys));
  } catch (e) {
    res.status(500).json({ message: 'Lỗi server: ' + e.message });
  }
});

// ====== API: XÓA KEY ======
app.post('/api/delete', (req, res) => {
  try {
    const { key } = req.body || {};
    const keys = loadKeys();
    if (keys[key]) {
      delete keys[key];
      saveKeys(keys);
      return res.json({ ok: true });
    }
    res.status(404).json({ message: 'Key không tồn tại' });
  } catch (e) {
    res.status(500).json({ message: 'Lỗi server: ' + e.message });
  }
});

// ====== API: RESET DEVICE BIND ======
app.post('/api/reset-device', (req, res) => {
  try {
    const { key } = req.body || {};
    const keys = loadKeys();
    const k = keys[key];
    if (!k) return res.status(404).json({ message: 'Key không tồn tại' });
    k.deviceId = null;
    k.deviceInfo = null;
    k.activatedAt = null;
    k.expiresAt = null;
    k.status = 'unused';
    saveKeys(keys);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Lỗi server: ' + e.message });
  }
});

// ====== API: KÍCH HOẠT ======
app.post('/api/activate', (req, res) => {
  try {
    const { key, deviceId, deviceInfo } = req.body || {};
    if (!key || !deviceId) {
      return res.status(400).json({ message: 'Thiếu key hoặc deviceId' });
    }

    const keys = loadKeys();
    const k = keys[key];
    if (!k) return res.status(404).json({ message: 'Key không tồn tại' });

    if (k.deviceId && k.deviceId !== deviceId) {
      return res.status(403).json({ message: 'Key đã khóa thiết bị khác' });
    }

    const now = Date.now();

    if (!k.deviceId) {
      k.deviceId = deviceId;
      k.activatedAt = now;
      k.expiresAt = now + k.durationMs;
      k.status = 'active';
      k.deviceInfo = deviceInfo || {};
      saveKeys(keys);
    } else if (now > k.expiresAt) {
      k.status = 'expired';
      saveKeys(keys);
      return res.status(403).json({ message: 'Key đã hết hạn' });
    }

    return res.json({
      key: k.key,
      type: k.durationLabel,
      duration: k.durationLabel,
      activatedAt: k.activatedAt,
      expiresAt: k.expiresAt,
      deviceId: k.deviceId
    });
  } catch (e) {
    res.status(500).json({ message: 'Lỗi server: ' + e.message });
  }
});

// ====== API: XÁC THỰC ======
app.post('/api/verify', (req, res) => {
  try {
    const { key, deviceId } = req.body || {};
    const keys = loadKeys();
    const k = keys[key];
    if (!k || k.deviceId !== deviceId) {
      return res.status(403).json({ message: 'Sai key hoặc thiết bị' });
    }
    if (Date.now() > k.expiresAt) {
      return res.status(403).json({ message: 'Key đã hết hạn' });
    }
    return res.json({ ok: true, expiresAt: k.expiresAt });
  } catch (e) {
    res.status(500).json({ message: 'Lỗi server: ' + e.message });
  }
});

// ====== SERVE STATIC ======
app.use(express.static(path.join(__dirname, 'public')));

// ====== START ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HBAO KEY API running on port ' + PORT));
