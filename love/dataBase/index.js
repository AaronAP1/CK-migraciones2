const mysql = require("mysql2/promise");

const MYSQL_DB=process.env.MYSQL_DB
const MYSQL_HOST=process.env.MYSQL_HOST
const MYSQL_USER=process.env.MYSQL_USER
const MYSQL_PASSWORD=process.env.MYSQL_PASSWORD

let pool;
function getDbPool() {
  if (!pool) {
    console.log("[DEBUG] Initializing MySQL pool");
    pool = mysql.createPool({
      host: MYSQL_HOST,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DB,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}