const express = require('express');
const router = express.Router();
const db = require('../database');

// 获取设备的告警记录
router.get('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const unreadOnly = req.query.unread === 'true';

    let sql = 'SELECT * FROM alerts WHERE device_id = ?';
    const params = [deviceId];

    if (unreadOnly) {
      sql += ' AND is_read = FALSE';
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const alerts = await db.query(sql, params);

    res.json(alerts);

  } catch (error) {
    console.error('获取告警记录失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取未读告警数量
router.get('/:deviceId/unread-count', async (req, res) => {
  try {
    const { deviceId } = req.params;

    const result = await db.getOne(
      'SELECT COUNT(*) as count FROM alerts WHERE device_id = ? AND is_read = FALSE',
      [deviceId]
    );

    res.json({ count: result.count });

  } catch (error) {
    console.error('获取未读告警数失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 标记告警为已读
router.post('/:alertId/read', async (req, res) => {
  try {
    const { alertId } = req.params;

    await db.query(
      'UPDATE alerts SET is_read = TRUE WHERE id = ?',
      [alertId]
    );

    res.json({ success: true });

  } catch (error) {
    console.error('标记告警失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 标记所有告警为已读
router.post('/:deviceId/read-all', async (req, res) => {
  try {
    const { deviceId } = req.params;

    await db.query(
      'UPDATE alerts SET is_read = TRUE WHERE device_id = ?',
      [deviceId]
    );

    res.json({ success: true, message: '所有告警已标记为已读' });

  } catch (error) {
    console.error('标记所有告警失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 删除告警
router.delete('/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;

    await db.query('DELETE FROM alerts WHERE id = ?', [alertId]);

    res.json({ success: true });

  } catch (error) {
    console.error('删除告警失败:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;