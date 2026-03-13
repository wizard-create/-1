const mqtt=require('mqtt');
const db=require('./database');

class MQTTHandler {
  constructor(){
    this.client=null;
    this.connect();
  }
  connect(){
    this.client=mqtt.connect('mqtt://localhost:1883',{
      username:'administrator',
      password:'Admin123456',
      clientId: 'backend_v1_'+Math.random().toString(16).substring(2, 8)
    });
    this.client.on('connect',()=>{
      console.log('MQTT服务器连接成功');
      this.client.subscribe('plant/+/sensor',(err)=>{
        if(!err){
          console.log('已订阅 sensor 主题');
        }
      });
    });
    this.client.on('message',(topic, message)=>{
      this.handleMessage(topic, message);
    });
    this.client.on('error',(err)=>{
      console.error('MQTT错误:',err);
    });
  }
  async handleMessage(topic,message) {
    try{
      const deviceId=topic.split('/')[0];
      const data=JSON.parse(message.toString());
      console.log(`收到设备 ${deviceId} 数据:`, data);
      await db.query(
        `INSERT INTO sensor_data 
         (device_id, moisture, temperature, light) 
         VALUES (?, ?, ?, ?)`,
        [
          deviceId,
          data.moisture||null,
          data.temperature||null,
          data.light||null
        ]
      );
      await db.query(
        'UPDATE devices SET last_seen = NOW() WHERE device_id = ?',
        [deviceId]
      );
      if(data.moisture && data.moisture<30){
        console.log(`设备 ${deviceId} 土壤过干，触发自动浇水`);
        this.sendCommand(deviceId,{
          action:'pump',
          value:'on',
          duration:3
        });
      }
    }catch(error){
      console.error('处理MQTT消息出错:',error.message);
    }
  }
  sendCommand(deviceId,command){
    if(this.client && this.client.connected){
      this.client.publish(`${deviceId}/control`,JSON.stringify(command));
      console.log(`发送指令给 ${deviceId}:`,command);
      return true;
    }
    return false;
  }
}

module.exports = MQTTHandler;