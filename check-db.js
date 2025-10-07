import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'tsvrot2025-server.mysql.database.azure.com',
  user: 'rarsmzerix',
  password: 'HalloTSVRot2025',
  database: 'tsvrot2025-database',
  ssl: { rejectUnauthorized: false }
});

console.log('Cancelled Courses:');
const [cancelled] = await connection.query('SELECT * FROM cancelled_courses');
console.table(cancelled);

console.log('\nWeekly Assignments:');
const [assignments] = await connection.query('SELECT * FROM weekly_assignments LIMIT 10');
console.table(assignments);

await connection.end();
