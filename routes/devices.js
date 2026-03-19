const express = require('express');
const router = express.Router();
const db = require('../database');

// 获取所有设备
router.get('/', async (req, res) => {
  try {
    const devices = await db.query(`
      SELECT d.*, 
             (SELECT COUNT(*) FROM alerts WHERE device_id = d.device_id AND is_read = FALSE) as unread_alerts,
             (SELECT soil_moisture FROM sensor_data WHERE device_id = d.device_id ORDER BY created_at DESC LIMIT 1) as last_moisture
      FROM devices d
      ORDER BY d.created_at DESC
    `);

    // 计算在线状态（5分钟内在线）
    const now = new Date();
    devices.forEach(device => {
      const lastSeen = new Date(device.last_seen);
      const minutesSinceLastSeen = (now - lastSeen) / (1000 * 60);
      device.is_online = minutesSinceLastSeen < 5;
    });

    res.json(devices);
  } catch (error) {
    console.error('获取设备列表失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取单个设备详情
router.get('/:deviceId', async (req, res) => {
  try {
    const device = await db.getOne(
      'SELECT * FROM devices WHERE device_id = ?',
      [req.params.deviceId]
    );

    if (!device) {
      return res.status(404).json({ error: '设备不存在' });
    }

    // 获取最新传感器数据
    const latest = await db.getOne(
      'SELECT * FROM sensor_data WHERE device_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.params.deviceId]
    );

    // 获取最近24小时的历史数据（每小时一个点）
    const history = await db.query(`
      SELECT 
        DATE_FORMAT(created_at, '%H:00') as time,
        AVG(soil_moisture) as soil_moisture,
        AVG(temperature) as temperature,
        AVG(light_intensity) as light
      FROM sensor_data 
      WHERE device_id = ? 
        AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d %H')
      ORDER BY created_at ASC
    `, [req.params.deviceId]);

    // 获取设备配置
    const config = await db.getOne(
      'SELECT * FROM device_config WHERE device_id = ?',
      [req.params.deviceId]
    );

    // 计算在线状态
    const lastSeen = new Date(device.last_seen);
    const minutesSinceLastSeen = (Date.now() - lastSeen) / (1000 * 60);
    const is_online = minutesSinceLastSeen < 5;

    res.json({
      ...device,
      is_online,
      latest_data: latest || null,
      history: history,
      config: config || null
    });

  } catch (error) {
    console.error('获取设备详情失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 注册新设备
router.post('/', async (req, res) => {
  try {
    const { device_id, name } = req.body;

    // 验证输入
    if (!device_id || !name) {
      return res.status(400).json({ error: '设备ID和名称不能为空' });
    }

    // 检查是否已存在
    const existing = await db.getOne(
      'SELECT device_id FROM devices WHERE device_id = ?',
      [device_id]
    );

    if (existing) {
      return res.status(400).json({ error: '设备ID已存在' });
    }

    // 插入设备
    await db.query(
      'INSERT INTO devices (device_id, name, last_seen) VALUES (?, ?, NOW())',
      [device_id, name]
    );

    // 创建默认配置
    await db.query(
      'INSERT INTO device_config (device_id) VALUES (?)',
      [device_id]
    );

    res.status(201).json({
      success: true,
      message: '设备注册成功',
      device: { device_id, name }
    });

  } catch (error) {
    console.error('注册设备失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 更新设备信息
router.put('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { name } = req.body;

    await db.query(
      'UPDATE devices SET name = ? WHERE device_id = ?',
      [name, deviceId]
    );

    res.json({ success: true, message: '设备信息已更新' });

  } catch (error) {
    console.error('更新设备失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 删除设备
router.delete('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    // 删除相关数据（事务）
    await db.transaction(async (connection) => {
      await connection.execute('DELETE FROM sensor_data WHERE device_id = ?', [deviceId]);
      await connection.execute('DELETE FROM alerts WHERE device_id = ?', [deviceId]);
      await connection.execute('DELETE FROM device_config WHERE device_id = ?', [deviceId]);
      await connection.execute('DELETE FROM devices WHERE device_id = ?', [deviceId]);
    });

    res.json({ success: true, message: '设备已删除' });

  } catch (error) {
    console.error('删除设备失败:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;