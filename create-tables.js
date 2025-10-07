import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'tsvrot2025-server.mysql.database.azure.com',
  user: 'rarsmzerix',
  password: 'HalloTSVRot2025',
  database: 'tsvrot2025-database',
  ssl: { rejectUnauthorized: false }
});

console.log('Erstelle Tabellen...\n');

// Trainers
await connection.query(`
  CREATE TABLE IF NOT EXISTS trainers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✓ Tabelle trainers erstellt');

// Courses
await connection.query(`
  CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    day_of_week VARCHAR(20) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location VARCHAR(255),
    category VARCHAR(100),
    required_trainers INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✓ Tabelle courses erstellt');

// Weekly Assignments
await connection.query(`
  CREATE TABLE IF NOT EXISTS weekly_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    week_number INT NOT NULL,
    year INT NOT NULL,
    trainer_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_assignment (course_id, week_number, year, trainer_id),
    INDEX idx_week (course_id, week_number, year)
  )
`);
console.log('✓ Tabelle weekly_assignments erstellt');

// Cancelled Courses
await connection.query(`
  CREATE TABLE IF NOT EXISTS cancelled_courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    week_number INT NOT NULL,
    year INT NOT NULL,
    reason VARCHAR(255) DEFAULT 'Sonstiges',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_cancellation (course_id, week_number, year)
  )
`);
console.log('✓ Tabelle cancelled_courses erstellt');

// Holiday Weeks
await connection.query(`
  CREATE TABLE IF NOT EXISTS holiday_weeks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    week_number INT NOT NULL,
    year INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_holiday (week_number, year)
  )
`);
console.log('✓ Tabelle holiday_weeks erstellt');

console.log('\n✅ Alle Tabellen erfolgreich erstellt!');
await connection.end();
