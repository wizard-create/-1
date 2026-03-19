const mqtt = require('mqtt');
const db = require('./database');

class MQTTHandler {
  constructor(wsServer) {
    this.wsServer = wsServer;
    this.client = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    
    this.connect();
  }

  connect() {
    const clientId = 'backend_' + Math.random().toString(36).substring(2, 10);

    this.client = mqtt.connect(`mqtt://${process.env.MQTT_HOST || 'localhost'}:${process.env.MQTT_PORT || 1883}`, {
      username: process.env.MQTT_USER || 'administrator',
      password: process.env.MQTT_PASSWORD || 'Admin123456',
      clientId: clientId,
      keepalive: 60,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
      clean: true
    });

    this.client.on('connect', () => {
      console.log('MQTT服务器连接成功');
      this.reconnectAttempts = 0;

      // 订阅所有主题
      const topics = [
        'plant/+/sensor',  // 传感器数据
        'plant/+/status',  // 设备状态
        'plant/+/heartbeat' // 心跳
      ];

      topics.forEach(topic => {
        this.client.subscribe(topic, { qos: 1 }, (err) => {
          if (!err) {
            console.log(`📡 已订阅主题: ${topic}`);
          }
        });
      });
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.client.on('error', (err) => {
      console.error('MQTT错误:', err);
    });

    this.client.on('close', () => {
      console.log('MQTT连接关闭');
      this.reconnect();
    });
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect();
      }, 5000);
    } else {
      console.error('MQTT重连失败，请检查网络');
    }
  }

  async handleMessage(topic, message) {
    try {
      const parts = topic.split('/');
      const deviceId = parts[0];
      const type = parts[1];
      
      const data = JSON.parse(message.toString());
      
      console.log(`收到设备 ${deviceId} ${type}数据:`, data);

      switch(type) {
        case 'sensor':
          await this.handleSensorData(deviceId, data);
          break;
        case 'status':
          await this.handleDeviceStatus(deviceId, data);
          break;
        case 'heartbeat':
          await this.handleHeartbeat(deviceId, data);
          break;
        default:
          console.log('未知消息类型:', type);
      }
    } catch (error) {
      console.error('处理MQTT消息出错:', error.message);
    }
  }

  async handleSensorData(deviceId, data) {
    // 1. 存入数据库
    await db.query(
      `INSERT INTO sensor_data 
       (device_id, soil_moisture, temperature, humidity, light_intensity, 
        battery_level, wifi_strength, fault_code) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deviceId,
        data.soil_moisture || null,
        data.temperature || null,
        data.humidity || null,
        data.light || null,
        data.battery || null,
        data.wifi || null,
        data.fault || null
      ]
    );

    // 2. 更新设备最后在线时间
    await db.query(
      'UPDATE devices SET last_seen = NOW() WHERE device_id = ?',
      [deviceId]
    );

    // 3. 检查阈值并触发告警
    await this.checkThresholds(deviceId, data);

    // 4. 通过WebSocket推送给前端
    this.wsServer.pushToDevice(deviceId, {
      ...data,
      deviceId: deviceId,
      updatedAt: new Date().toISOString()
    });
  }

  async handleDeviceStatus(deviceId, data) {
    // 更新设备状态（LED颜色、模式等）
    await db.query(
      `UPDATE devices SET 
       led_color = ?,
       mode = ?,
       pump_status = ?,
       light_status = ?,
       last_seen = NOW()
       WHERE device_id = ?`,
      [
        data.led_color || 'green',
        data.mode || 'auto',
        data.pump_status || false,
        data.light_status || false,
        deviceId
      ]
    );

    // 推送给前端
    this.wsServer.pushToDevice(deviceId, {
      type: 'status_change',
      ...data,
      deviceId: deviceId
    });
  }

  async handleHeartbeat(deviceId, data) {
    // 处理心跳，只更新最后在线时间
    await db.query(
      'UPDATE devices SET last_seen = NOW() WHERE device_id = ?',
      [deviceId]
    );
  }

  async checkThresholds(deviceId, data) {
    // 获取设备配置
    const config = await db.getOne(
      'SELECT * FROM device_config WHERE device_id = ?',
      [deviceId]
    );

    if (!config) return;

    const alerts = [];

    // 1. 土壤湿度检查
    if (data.soil_moisture !== undefined) {
      if (data.soil_moisture < config.soil_moisture_min) {
        alerts.push({
          type: 'low_soil_moisture',
          message: `土壤过干 (${data.soil_moisture}% < ${config.soil_moisture_min}%)`,
          value: data.soil_moisture,
          threshold: config.soil_moisture_min
        });

        // 自动浇水
        if (config.auto_water) {
          this.sendCommand(deviceId, {
            action: 'pump',
            value: 'on',
            duration: 5
          });
        }
      } else if (data.soil_moisture > config.soil_moisture_max) {
        alerts.push({
          type: 'high_soil_moisture',
          message: `土壤过湿 (${data.soil_moisture}% > ${config.soil_moisture_max}%)`,
          value: data.soil_moisture,
          threshold: config.soil_moisture_max
        });
      }
    }

    // 2. 温度检查
    if (data.temperature !== undefined) {
      if (data.temperature > config.temperature_max) {
        alerts.push({
          type: 'high_temperature',
          message: `温度过高 (${data.temperature}°C > ${config.temperature_max}°C)`,
          value: data.temperature,
          threshold: config.temperature_max
        });
      } else if (data.temperature < config.temperature_min) {
        alerts.push({
          type: 'low_temperature',
          message: `温度过低 (${data.temperature}°C < ${config.temperature_min}°C)`,
          value: data.temperature,
          threshold: config.temperature_min
        });
      }
    }

    // 3. 光照检查
    if (data.light !== undefined) {
      if (data.light < config.light_min) {
        alerts.push({
          type: 'low_light',
          message: `光照不足 (${data.light} lux < ${config.light_min} lux)`,
          value: data.light,
          threshold: config.light_min
        });

        // 自动补光
        if (config.auto_light) {
          this.sendCommand(deviceId, {
            action: 'light',
            value: 'on'
          });
        }
      } else if (data.light > config.light_max) {
        alerts.push({
          type: 'high_light',
          message: `光照过强 (${data.light} lux > ${config.light_max} lux)`,
          value: data.light,
          threshold: config.light_max
        });
      }
    }

    // 4. 电量检查
    if (data.battery !== undefined && data.battery < 20) {
      alerts.push({
        type: 'low_battery',
        message: `电池电量低 (${data.battery}%)`,
        value: data.battery,
        threshold: 20
      });
    }

    // 5. WiFi信号检查
    if (data.wifi !== undefined && data.wifi < -70) {
      alerts.push({
        type: 'wifi_weak',
        message: `WiFi信号弱 (${data.wifi} dBm)`,
        value: data.wifi,
        threshold: -70
      });
    }

    // 6. 硬件故障检查
    if (data.fault) {
      alerts.push({
        type: 'hardware_fault',
        message: `硬件故障: ${data.fault}`,
        value: null,
        threshold: null
      });
    }

    // 保存告警并推送
    for (const alert of alerts) {
      await db.query(
        `INSERT INTO alerts (device_id, alert_type, message, value, threshold) 
         VALUES (?, ?, ?, ?, ?)`,
        [deviceId, alert.type, alert.message, alert.value, alert.threshold]
      );

      this.wsServer.pushAlert(deviceId, alert);
      console.log(`设备 ${deviceId} 告警:`, alert.message);
    }
  }

  // 发送指令给硬件
  sendCommand(deviceId, command) {
    if (this.client && this.client.connected) {
      const topic = `${deviceId}/control`;
      const payload = JSON.stringify(command);
      
      this.client.publish(topic, payload, { qos: 1, retain: false }, (err) => {
        if (err) {
          console.error(`发送指令失败:`, err);
        } else {
          console.log(`发送指令给 ${deviceId}:`, command);
        }
      });
      
      return true;
    }
    return false;
  }

  // 获取连接状态
  isConnected() {
    return this.client && this.client.connected;
  }
}

module.exports = MQTTHandler;