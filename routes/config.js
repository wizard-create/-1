const express = require('express');
const router = express.Router();
const db = require('../database');

// 获取设备配置
router.get('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    let config = await db.getOne(
      'SELECT * FROM device_config WHERE device_id = ?',
      [deviceId]
    );

    // 如果配置不存在，创建默认配置
    if (!config) {
      await db.query(
        'INSERT INTO device_config (device_id) VALUES (?)',
        [deviceId]
      );

      config = await db.getOne(
        'SELECT * FROM device_config WHERE device_id = ?',
        [deviceId]
      );
    }

    res.json(config);

  } catch (error) {
    console.error('获取设备配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 更新设备配置
router.post('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const {
      soil_moisture_min,
      soil_moisture_max,
      temperature_min,
      temperature_max,
      light_min,
      light_max,
      auto_water,
      auto_light
    } = req.body;

    // 构建更新语句
    const updates = [];
    const params = [];

    if (soil_moisture_min !== undefined) {
      updates.push('soil_moisture_min = ?');
      params.push(soil_moisture_min);
    }
    if (soil_moisture_max !== undefined) {
      updates.push('soil_moisture_max = ?');
      params.push(soil_moisture_max);
    }
    if (temperature_min !== undefined) {
      updates.push('temperature_min = ?');
      params.push(temperature_min);
    }
    if (temperature_max !== undefined) {
      updates.push('temperature_max = ?');
      params.push(temperature_max);
    }
    if (light_min !== undefined) {
      updates.push('light_min = ?');
      params.push(light_min);
    }
    if (light_max !== undefined) {
      updates.push('light_max = ?');
      params.push(light_max);
    }
    if (auto_water !== undefined) {
      updates.push('auto_water = ?');
      params.push(auto_water ? 1 : 0);
    }
    if (auto_light !== undefined) {
      updates.push('auto_light = ?');
      params.push(auto_light ? 1 : 0);
    }

    updates.push('updated_at = NOW()');
    params.push(deviceId);

    if (updates.length > 0) {
      const sql = `UPDATE device_config SET ${updates.join(', ')} WHERE device_id = ?`;
      await db.query(sql, params);
    }

    // 获取更新后的配置
    const newConfig = await db.getOne(
      'SELECT * FROM device_config WHERE device_id = ?',
      [deviceId]
    );

    res.json({
      success: true,
      message: '配置已更新',
      config: newConfig
    });

  } catch (error) {
    console.error('更新设备配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 重置为默认配置
router.post('/:deviceId/reset', async (req, res) => {
  try {
    const { deviceId } = req.params;

    await db.query(
      `UPDATE device_config SET 
       soil_moisture_min = 30,
       soil_moisture_max = 70,
       temperature_min = 15,
       temperature_max = 30,
       light_min = 500,
       light_max = 3000,
       auto_water = TRUE,
       auto_light = TRUE,
       updated_at = NOW()
       WHERE device_id = ?`,
      [deviceId]
    );

    res.json({ success: true, message: '配置已重置为默认值' });

  } catch (error) {
    console.error('重置配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;