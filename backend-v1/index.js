const express=require('express');
const cors=require('cors');
const db=require('./database');
const MQTTHandler=require('./mqtt-handler');

const app = express();
const PORT = 3000;

new MQTTHandler();

app.use(cors());
app.use(express.json());

app.get('/', (req,res)=>{
  res.json({ 
    message: '智能植物养护助手后端V1',
    time: new Date().toISOString()
  });
});

app.get('/api/devices',async (req, res)=>{
  try{
    const devices=await db.query('SELECT * FROM devices');
    res.json(devices);
  }catch (error){
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:deviceId/latest',async(req, res)=>{
  try {
    const data=await db.getOne(
      'SELECT * FROM sensor_data WHERE device_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.params.deviceId]
    );
    res.json(data || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:deviceId/history',async(req, res)=>{
  try{
    const hours=req.query.hours||24;
    const data=await db.query(
      `SELECT 
        DATE_FORMAT(created_at, '%H:%i') as time,
        moisture,
        temperature,
        light
      FROM sensor_data 
      WHERE device_id = ? 
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      ORDER BY created_at ASC`,
      [req.params.deviceId,hours]
    );
    res.json(data);
  }catch(error){
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/control/pump',async(req,res)=>{
  try {
    const{device_id,action,duration}=req.body;
    res.json({ 
      success:true, 
      message:`水泵${action==='on'?'开启' : '关闭'}指令已发送（模拟）`
    });  
  }catch(error){
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/control/light', async (req, res) => {
  try {
    const { device_id, action } = req.body;
    res.json({ 
      success:true, 
      message:`补光灯${action==='on'?'开启':'关闭'}指令已发送（模拟）`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0',()=>{
  console.log(`
  🚀 智能植物养护助手后端V1
  =========================
  HTTP服务: http://0.0.0.0:${PORT}
  可用接口:
    GET  /
    GET  /api/devices
    GET  /api/devices/:id/latest
    GET  /api/devices/:id/history
    POST /api/control/pump
    POST /api/control/light
  =========================
  `);
});