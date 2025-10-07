import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'tsvrot2025-server.mysql.database.azure.com',
  user: 'rarsmzerix',
  password: 'HalloTSVRot2025',
  database: 'tsvrot2025-database',
  ssl: { rejectUnauthorized: false }
});

const [cancelled] = await connection.query('SELECT * FROM cancelled_courses');
console.log('Ausgefallene Kurse:', cancelled);

await connection.end();
