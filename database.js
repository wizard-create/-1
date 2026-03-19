const mysql = require('mysql2');

class Database {
  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '123456',
      database: process.env.DB_NAME || 'plant',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

    this.promisePool = this.pool.promise();
  }

  // 查询多条记录
  async query(sql, params = []) {
    try {
      const [rows] = await this.promisePool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error('数据库查询错误:', error);
      throw error;
    }
  }

  // 查询单条记录
  async getOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }

  // 插入数据
  async insert(sql, params = []) {
    const [result] = await this.promisePool.execute(sql, params);
    return result.insertId;
  }

  // 更新数据
  async update(sql, params = []) {
    const [result] = await this.promisePool.execute(sql, params);
    return result.affectedRows;
  }

  // 删除数据
  async delete(sql, params = []) {
    const [result] = await this.promisePool.execute(sql, params);
    return result.affectedRows;
  }

  // 事务处理
  async transaction(callback) {
    const connection = await this.promisePool.getConnection();
    await connection.beginTransaction();

    try {
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new Database();