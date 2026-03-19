const WebSocket = require('ws');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map();  // 存储所有客户端连接
    
    this.init();
  }

  init() {
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      const clientIp = req.socket.remoteAddress;

      // 存储客户端信息
      this.clients.set(clientId, {
        ws,
        subscriptions: new Set(),
        ip: clientIp,
        connectedAt: new Date()
      });

      console.log(`新客户端连接 [${clientId}] from ${clientIp}`);

      // 处理收到的消息
      ws.on('message', (message) => {
        this.handleMessage(clientId, message);
      });

      // 处理心跳
      ws.on('pong', () => {
        const client = this.clients.get(clientId);
        if (client) {
          client.lastPong = Date.now();
        }
      });

      // 处理断开连接
      ws.on('close', () => {
        console.log(`客户端断开连接 [${clientId}]`);
        this.clients.delete(clientId);
      });

      // 处理错误
      ws.on('error', (error) => {
        console.error(`客户端错误 [${clientId}]:`, error.message);
      });

      // 发送欢迎消息
      this.sendToClient(clientId, {
        type: 'welcome',
        message: '连接成功',
        clientId: clientId,
        timestamp: new Date().toISOString()
      });

      // 开始心跳检测
      this.startHeartbeat(clientId);
    });
  }

  // 生成客户端ID
  generateClientId() {
    return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  // 处理客户端消息
  handleMessage(clientId, message) {
    try {
      const data = JSON.parse(message.toString());
      const client = this.clients.get(clientId);

      if (!client) return;

      switch(data.type) {
        case 'subscribe':
          // 订阅设备
          if (data.deviceId) {
            client.subscriptions.add(data.deviceId);
            console.log(`客户端 ${clientId} 订阅了设备 ${data.deviceId}`);
            
            this.sendToClient(clientId, {
              type: 'subscribe_success',
              deviceId: data.deviceId,
              message: '订阅成功'
            });
          }
          break;

        case 'unsubscribe':
          // 取消订阅
          if (data.deviceId) {
            client.subscriptions.delete(data.deviceId);
            console.log(`客户端 ${clientId} 取消订阅设备 ${data.deviceId}`);
          }
          break;

        case 'ping':
          // 心跳响应
          this.sendToClient(clientId, { type: 'pong' });
          break;

        case 'get_status':
          // 获取客户端状态
          this.sendToClient(clientId, {
            type: 'status',
            subscriptions: Array.from(client.subscriptions),
            connectedAt: client.connectedAt
          });
          break;

        default:
          console.log('未知消息类型:', data.type);
      }
    } catch (error) {
      console.error('处理WebSocket消息错误:', error);
    }
  }

  // 发送消息给指定客户端
  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  // 推送数据给订阅了某设备的所有客户端
  pushToDevice(deviceId, data) {
    let pushCount = 0;

    this.clients.forEach((client, clientId) => {
      if (client.subscriptions.has(deviceId) && 
          client.ws.readyState === WebSocket.OPEN) {
        
        client.ws.send(JSON.stringify({
          type: 'sensor_data',
          deviceId: deviceId,
          data: data,
          timestamp: new Date().toISOString()
        }));
        
        pushCount++;
      }
    });

    if (pushCount > 0) {
      console.log(`已推送数据给 ${pushCount} 个客户端 (设备: ${deviceId})`);
    }

    return pushCount;
  }

  // 推送告警消息
  pushAlert(deviceId, alert) {
    let pushCount = 0;

    this.clients.forEach((client) => {
      if (client.subscriptions.has(deviceId) && 
          client.ws.readyState === WebSocket.OPEN) {
        
        client.ws.send(JSON.stringify({
          type: 'alert',
          deviceId: deviceId,
          alert: alert,
          timestamp: new Date().toISOString()
        }));
        
        pushCount++;
      }
    });

    if (pushCount > 0) {
      console.log(`已推送告警给 ${pushCount} 个客户端 (设备: ${deviceId})`);
    }

    return pushCount;
  }

  // 广播消息给所有客户端
  broadcast(message) {
    let broadcastCount = 0;

    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'broadcast',
          message: message,
          timestamp: new Date().toISOString()
        }));
        broadcastCount++;
      }
    });

    console.log(`广播消息给 ${broadcastCount} 个客户端`);
    return broadcastCount;
  }

  // 开始心跳检测
  startHeartbeat(clientId) {
    const interval = setInterval(() => {
      const client = this.clients.get(clientId);
      
      if (!client) {
        clearInterval(interval);
        return;
      }

      if (client.ws.readyState === WebSocket.OPEN) {
        // 发送ping，等待pong
        client.ws.ping();
        
        // 检查上次pong时间
        if (client.lastPong && Date.now() - client.lastPong > 30000) {
          console.log(`客户端 ${clientId} 心跳超时，断开连接`);
          client.ws.terminate();
          clearInterval(interval);
        }
      }
    }, 15000); // 每15秒检查一次
  }

  // 获取在线客户端数量
  getClientCount() {
    return this.clients.size;
  }

  // 获取设备订阅者数量
  getSubscriberCount(deviceId) {
    let count = 0;
    this.clients.forEach((client) => {
      if (client.subscriptions.has(deviceId)) {
        count++;
      }
    });
    return count;
  }
}

module.exports = WebSocketServer;