const express = require('express');
const router = express.Router();
const db = require('../database');

module.exports = (mqttHandler) => {
  // 控制水泵
  router.post('/pump', async (req, res) => {
    try {
      const { device_id, action, duration } = req.body;

      // 验证参数
      if (!device_id) {
        return res.status(400).json({ error: '设备ID不能为空' });
      }

      if (!['on', 'off'].includes(action)) {
        return res.status(400).json({ error: '动作必须是 on 或 off' });
      }

      // 检查设备是否存在
      const device = await db.getOne(
        'SELECT device_id FROM devices WHERE device_id = ?',
        [device_id]
      );

      if (!device) {
        return res.status(404).json({ error: '设备不存在' });
      }

      // 构建指令
      const command = {
        action: 'pump',
        value: action,
        duration: action === 'on' ? (duration || 3) : 0
      };

      // 通过MQTT发送
      const sent = mqttHandler.sendCommand(device_id, command);

      if (sent) {
        // 记录控制日志
        console.log(`设备 ${device_id} 水泵${action === 'on' ? '开启' : '关闭'}`);

        // 更新设备状态
        await db.query(
          'UPDATE devices SET pump_status = ? WHERE device_id = ?',
          [action === 'on' ? 1 : 0, device_id]
        );

        res.json({
          success: true,
          message: `水泵${action === 'on' ? '开启' : '关闭'}指令已发送`,
          command: command
        });
      } else {
        res.status(500).json({ error: 'MQTT服务器连接失败' });
      }

    } catch (error) {
      console.error('控制水泵失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 控制补光灯
  router.post('/light', async (req, res) => {
    try {
      const { device_id, action } = req.body;

      if (!device_id || !['on', 'off'].includes(action)) {
        return res.status(400).json({ error: '参数错误' });
      }

      const command = {
        action: 'light',
        value: action
      };

      const sent = mqttHandler.sendCommand(device_id, command);

      if (sent) {
        await db.query(
          'UPDATE devices SET light_status = ? WHERE device_id = ?',
          [action === 'on' ? 1 : 0, device_id]
        );

        res.json({
          success: true,
          message: `补光灯${action === 'on' ? '开启' : '关闭'}`
        });
      } else {
        res.status(500).json({ error: 'MQTT服务器连接失败' });
      }

    } catch (error) {
      console.error('控制补光灯失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 控制LED
  router.post('/led', async (req, res) => {
    try {
      const { device_id, color } = req.body;

      // 验证颜色
      const supportedColors = ['red', 'green', 'blue', 'yellow', 'purple', 'off'];
      if (!supportedColors.includes(color)) {
        return res.status(400).json({
          error: `不支持的颜色，可用: ${supportedColors.join(', ')}`
        });
      }

      const command = {
        action: 'led',
        value: color
      };

      const sent = mqttHandler.sendCommand(device_id, command);

      if (sent) {
        await db.query(
          'UPDATE devices SET led_color = ? WHERE device_id = ?',
          [color, device_id]
        );

        res.json({
          success: true,
          message: `LED已设为${color}色`
        });
      } else {
        res.status(500).json({ error: 'MQTT服务器连接失败' });
      }

    } catch (error) {
      console.error('控制LED失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 切换模式
  router.post('/mode', async (req, res) => {
    try {
      const { device_id, mode } = req.body;

      if (!['auto', 'manual'].includes(mode)) {
        return res.status(400).json({ error: '模式必须是 auto 或 manual' });
      }

      const command = {
        action: 'mode',
        value: mode
      };

      const sent = mqttHandler.sendCommand(device_id, command);

      if (sent) {
        await db.query(
          'UPDATE devices SET mode = ? WHERE device_id = ?',
          [mode, device_id]
        );

        res.json({
          success: true,
          message: `已切换到${mode === 'auto' ? '自动' : '手动'}模式`
        });
      } else {
        res.status(500).json({ error: 'MQTT服务器连接失败' });
      }

    } catch (error) {
      console.error('切换模式失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};