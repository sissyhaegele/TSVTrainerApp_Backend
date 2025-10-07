import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';

const app = express();
const PORT = 8181;

app.use(cors({
  origin: ['https://tsvrottrainer.azurewebsites.net', 'http://localhost:3000']
}));
app.use(express.json());

// WICHTIG: TSVRot2025_database mit GROSSEM R!
const pool = mysql.createPool({
  host: 'tsvrot2025-server.mysql.database.azure.com',
  user: 'rarsmzerix',
  password: 'HalloTSVRot2025',
  database: 'TSVRot2025_database',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false }
});

// Test Verbindung
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL verbunden!');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL Fehler:', err.message);
  });

// TRAINER
app.get('/api/trainers', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM trainers');
    res.json(rows);
  } catch (error) {
    console.error('Trainer Fehler:', error.message);
    res.json([]);
  }
});

app.post('/api/trainers', async (req, res) => {
  const { firstName, lastName, email, phone } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO trainers (first_name, last_name, email, phone) VALUES (?, ?, ?, ?)',
      [firstName, lastName, email, phone]
    );
    res.json({ id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// KURSE
app.get('/api/courses', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM courses');
    res.json(rows);
  } catch (error) {
    console.error('Kurse Fehler:', error.message);
    res.json([]);
  }
});

app.post('/api/courses', async (req, res) => {
  const { name, dayOfWeek, startTime, endTime, location } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO courses (name, day_of_week, start_time, end_time, location) VALUES (?, ?, ?, ?, ?)',
      [name, dayOfWeek, startTime, endTime, location]
    );
    res.json({ id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WEEKLY ASSIGNMENTS
app.get('/api/weekly-assignments', async (req, res) => {
  const { courseId, weekNumber, year } = req.query;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [courseId, weekNumber, year]
    );
    res.json(rows);
  } catch (error) {
    res.json([]);
  }
});

app.post('/api/weekly-assignments', async (req, res) => {
  const { course_id, week_number, year, trainer_ids } = req.body;
  try {
    await pool.query(
      'DELETE FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    if (trainer_ids && trainer_ids.length > 0) {
      const values = trainer_ids.map(id => [course_id, week_number, year, id]);
      await pool.query(
        'INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES ?',
        [values]
      );
    }
    res.json({ message: 'Updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CANCELLED COURSES
app.get('/api/cancelled-courses', async (req, res) => {
  const { courseId, weekNumber, year } = req.query;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
      [courseId, weekNumber, year]
    );
    res.json(rows);
  } catch (error) {
    res.json([]);
  }
});

app.post('/api/cancelled-courses', async (req, res) => {
  const { course_id, week_number, year } = req.body;
  try {
    await pool.query(
      'INSERT INTO cancelled_courses (course_id, week_number, year) VALUES (?, ?, ?)',
      [course_id, week_number, year]
    );
    res.json({ message: 'Added' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/cancelled-courses', async (req, res) => {
  const { course_id, week_number, year } = req.query;
  try {
    await pool.query(
      'DELETE FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    res.json({ message: 'Removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// HOLIDAY WEEKS
app.get('/api/holiday-weeks', async (req, res) => {
  const { weekNumber, year } = req.query;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM holiday_weeks WHERE week_number = ? AND year = ?',
      [weekNumber, year]
    );
    res.json(rows);
  } catch (error) {
    res.json([]);
  }
});

app.post('/api/holiday-weeks', async (req, res) => {
  const { week_number, year } = req.body;
  try {
    await pool.query(
      'INSERT INTO holiday_weeks (week_number, year) VALUES (?, ?)',
      [week_number, year]
    );
    res.json({ message: 'Added' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/holiday-weeks', async (req, res) => {
  const { week_number, year } = req.query;
  try {
    await pool.query(
      'DELETE FROM holiday_weeks WHERE week_number = ? AND year = ?',
      [week_number, year]
    );
    res.json({ message: 'Removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// HEALTH CHECK
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      database: 'Connected',
      port: PORT 
    });
  } catch (error) {
    res.json({ 
      status: 'OK', 
      database: 'Error: ' + error.message,
      port: PORT 
    });
  }
});

// TEST
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API läuft',
    port: PORT,
    endpoints: ['/api/trainers', '/api/courses', '/api/health']
  });
});

// START
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}/api/health`);
  console.log(`📍 http://localhost:${PORT}/api/test`);
});
