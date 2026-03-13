const mysql=require('mysql2');

const pool=mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '123456',       
  database: 'plant',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

const promisePool=pool.promise();

const db={
  query:async(sql, params)=>{
    try{
      const[rows]=await promisePool.execute(sql,params);
      return rows;
    }catch(error){
      console.error('数据库查询错误:',error);
      throw error;
    }
  },
  getOne:async(sql, params)=>{
    const rows=await db.query(sql, params);
    return rows[0]||null;
  },
  insert:async(sql,params)=>{
    const [result]=await promisePool.execute(sql,params);
    return result.insertId;
  }
};

module.exports = db;