import { Pool } from "pg";

const pool = new Pool();

export async function findOrders(customerId: string, status: string) {
  const sql = `SELECT * FROM orders WHERE customer_id = '${customerId}' AND status = '${status}'`;
  const result = await pool.query(sql);
  return result.rows;
}
