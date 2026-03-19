require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

// 导入数据库
const db = require('./database');

// 导入WebSocket
const WebSocketServer = require('./websocket');

// 导入MQTT
const MQTTHandler = require('./mqtt-handler');

// 导入路由
const devicesRouter = require('./routes/devices');
const alertsRouter = require('./routes/alerts');
const configRouter = require('./routes/config');

const app = express();
const server = http.createServer(app);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件目录（用于存放前端文件）
app.use(express.static(path.join(__dirname, 'public')));

// 初始化WebSocket
const wsServer = new WebSocketServer(server);

// 初始化MQTT（传入WebSocket实例）
const mqttHandler = new MQTTHandler(wsServer);

// 导入需要mqttHandler的路由
const controlRouter = require('./routes/control')(mqttHandler);

// 路由注册
app.use('/api/devices', devicesRouter);
app.use('/api/control', controlRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/config', configRouter);

// 根路径 - 系统状态
app.get('/', (req, res) => {
  res.json({
    name: '智能植物养护助手后端',
    version: '2.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    services: {
      http: true,
      websocket: true,
      mqtt: mqttHandler.isConnected(),
      database: true
    },
    stats: {
      online_clients: wsServer.getClientCount()
    },
    endpoints: {
      devices: '/api/devices',
      control: '/api/control',
      alerts: '/api/alerts',
      config: '/api/config'
    }
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    time: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 系统状态统计
app.get('/api/stats', async (req, res) => {
  try {
    const deviceCount = await db.getOne('SELECT COUNT(*) as count FROM devices');
    const alertCount = await db.getOne('SELECT COUNT(*) as count FROM alerts WHERE is_read = FALSE');
    const todayDataCount = await db.getOne(
      'SELECT COUNT(*) as count FROM sensor_data WHERE DATE(created_at) = CURDATE()'
    );

    res.json({
      total_devices: deviceCount.count,
      unread_alerts: alertCount.count,
      today_data_points: todayDataCount.count,
      online_clients: wsServer.getClientCount()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 设备在线状态检查定时任务
setInterval(async () => {
  try {
    // 找出5分钟内没上报数据的设备
    const offlineDevices = await db.query(
      `SELECT device_id FROM devices 
       WHERE last_seen < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`
    );

    for (const device of offlineDevices) {
      // 检查最近10分钟是否有离线告警
      const recentAlert = await db.getOne(
        `SELECT id FROM alerts 
         WHERE device_id = ? AND alert_type = 'wifi_disconnected' 
         AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
        [device.device_id]
      );

      if (!recentAlert) {
        // 记录离线告警
        await db.query(
          `INSERT INTO alerts (device_id, alert_type, message) 
           VALUES (?, 'wifi_disconnected', '设备离线超过5分钟')`,
          [device.device_id]
        );

        // WebSocket推送
        wsServer.pushAlert(device.device_id, {
          type: 'wifi_disconnected',
          message: '设备离线超过5分钟'
        });

        console.log(`设备 ${device.device_id} 离线`);
      }
    }
  } catch (error) {
    console.error('检查设备在线状态失败:', error);
  }
}, 60000); // 每分钟执行一次

// 404处理
app.use((req, res) => {
  res.status(404).json({ 
    error: '接口不存在',
    path: req.path,
    method: req.method
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ 
    error: '服务器内部错误',
    message: err.message 
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  智能植物养护助手后端 V2.0
  ===============================
  HTTP服务:   http://0.0.0.0:${PORT}
  WebSocket:  ws://0.0.0.0:${PORT}
  MQTT服务:   localhost:1883
  环境:       ${process.env.NODE_ENV || 'development'}
  客户端数:   0
  ===============================
  `);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，准备关闭...');
  
  server.close(() => {
    console.log('HTTP服务器已关闭');
    
    // 关闭MQTT连接
    if (mqttHandler.client) {
      mqttHandler.client.end();
    }
    
    // 关闭所有WebSocket连接
    wsServer.wss.close();
    
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，准备关闭...');
  process.exit(0);
});