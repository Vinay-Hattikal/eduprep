import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(process.argv[2]);
console.log(JSON.stringify(r.rows));
await c.end();
