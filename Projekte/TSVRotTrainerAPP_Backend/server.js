import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({
  origin: 'https://tsvrottrainer.azurewebsites.net'
}));
app.use(express.json());

const pool = mysql.createPool({
  host: 'tsvrot2025-server.mysql.database.azure.com',
  user: 'rarsmzerix',
  password: 'HalloTSVRot2025',
  database: 'TSVRot2025_database',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

pool.getConnection()
  .then(conn => { console.log('MySQL Connected'); conn.release(); })
  .catch(err => console.error('MySQL Error:', err));

app.get('/api/weekly-assignments', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM weekly_assignments');
    const assignments = {};
    rows.forEach(r => {
      const key = `--`;
      if (!assignments[key]) assignments[key] = [];
      assignments[key].push(r.trainer_id);
    });
    res.json(assignments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/weekly-assignments', async (req, res) => {
  const { courseId, weekNumber, year, trainerIds } = req.body;
  try {
    await pool.query('DELETE FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?', [courseId, weekNumber, year]);
    if (trainerIds && trainerIds.length > 0) {
      const values = trainerIds.map(t => [courseId, weekNumber, year, t]);
      await pool.query('INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES ?', [values]);
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/weekly-assignments/:courseId/:weekNumber/:year', async (req, res) => {
  const { courseId, weekNumber, year } = req.params;
  try {
    await pool.query('DELETE FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?', [courseId, weekNumber, year]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/cancelled-courses', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cancelled_courses');
    const cancelled = rows.map(r => `--`);
    res.json(cancelled);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/cancelled-courses', async (req, res) => {
  const { courseId, weekNumber, year, reason } = req.body;
  try {
    await pool.query('INSERT INTO cancelled_courses (course_id, week_number, year, reason) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason = ?', [courseId, weekNumber, year, reason || 'Sonstiges', reason || 'Sonstiges']);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/cancelled-courses/:courseId/:weekNumber/:year', async (req, res) => {
  const { courseId, weekNumber, year } = req.params;
  try {
    await pool.query('DELETE FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?', [courseId, weekNumber, year]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/holiday-weeks', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM holiday_weeks');
    const holidays = rows.map(r => `-`);
    res.json(holidays);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/holiday-weeks', async (req, res) => {
  const { weekNumber, year } = req.body;
  try {
    await pool.query('INSERT INTO holiday_weeks (week_number, year) VALUES (?, ?) ON DUPLICATE KEY UPDATE week_number = week_number', [weekNumber, year]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/holiday-weeks/:weekNumber/:year', async (req, res) => {
  const { weekNumber, year } = req.params;
  try {
    await pool.query('DELETE FROM holiday_weeks WHERE week_number = ? AND year = ?', [weekNumber, year]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'Connected' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', database: 'Disconnected' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
