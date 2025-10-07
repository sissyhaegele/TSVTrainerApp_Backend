import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'tsvrot2025-server.mysql.database.azure.com',
  user: 'rarsmzerix',
  password: 'HalloTSVRot2025',
  database: 'tsvrot2025-database',
  ssl: { rejectUnauthorized: false }
});

// Test-Trainer
await connection.query(`
  INSERT INTO trainers (first_name, last_name, email) VALUES
  ('Max', 'Mustermann', 'max@tsvrot.de'),
  ('Anna', 'Schmidt', 'anna@tsvrot.de')
`);

// Test-Kurse
await connection.query(`
  INSERT INTO courses (name, day_of_week, start_time, end_time, location) VALUES
  ('Yoga', 'Montag', '10:00', '11:30', 'Halle 1'),
  ('Pilates', 'Dienstag', '18:00', '19:30', 'Halle 2')
`);

console.log('Test-Daten eingefügt!');
await connection.end();
