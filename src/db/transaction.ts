import type { Pool, PoolClient } from "pg";
export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("begin");
    const value = await work(client);
    await client.query("commit");
    return value;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      discard = true;
      throw new AggregateError([error, rollbackError], "Database rollback failed");
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
