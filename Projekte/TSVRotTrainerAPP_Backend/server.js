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

// Wochenspezifische Trainerzuweisungen
app.get('/api/weekly-assignments', async (req, res) => {
  try {
    const { courseId, weekNumber, year } = req.query;
    const [rows] = await pool.query(
      'SELECT * FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [courseId, weekNumber, year]
    );
    res.json(rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der wochenspezifischen Trainerzuweisungen:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/weekly-assignments', async (req, res) => {
  try {
    const { course_id, week_number, year, trainer_ids } = req.body;
    await pool.query(
      'DELETE FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    if (trainer_ids && trainer_ids.length > 0) {
      const values = trainer_ids.map((id) => [course_id, week_number, year, id]);
      await pool.query(
        'INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES ?',
        [values]
      );
    }
    res.status(201).json({ message: 'Wochenspezifische Trainerzuweisungen aktualisiert' });
  } catch (error) {
    console.error('Fehler beim Aktualisieren der wochenspezifischen Trainerzuweisungen:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Kursausfälle
app.get('/api/cancelled-courses', async (req, res) => {
  try {
    const { courseId, weekNumber, year } = req.query;
    const [rows] = await pool.query(
      'SELECT * FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
      [courseId, weekNumber, year]
    );
    res.json(rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Kursausfälle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/cancelled-courses', async (req, res) => {
  try {
    const { course_id, week_number, year } = req.body;
    await pool.query(
      'INSERT INTO cancelled_courses (course_id, week_number, year) VALUES (?, ?, ?)',
      [course_id, week_number, year]
    );
    res.status(201).json({ message: 'Kursausfall hinzugefügt' });
  } catch (error) {
    console.error('Fehler beim Hinzufügen des Kursausfalls:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/cancelled-courses', async (req, res) => {
  try {
    const { course_id, week_number, year } = req.query;
    await pool.query(
      'DELETE FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    res.json({ message: 'Kursausfall entfernt' });
  } catch (error) {
    console.error('Fehler beim Entfernen des Kursausfalls:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ferienwochen
app.get('/api/holiday-weeks', async (req, res) => {
  try {
    const { weekNumber, year } = req.query;
    const [rows] = await pool.query(
      'SELECT * FROM holiday_weeks WHERE week_number = ? AND year = ?',
      [weekNumber, year]
    );
    res.json(rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Ferienwochen:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/holiday-weeks', async (req, res) => {
  try {
    const { week_number, year } = req.body;
    await pool.query(
      'INSERT INTO holiday_weeks (week_number, year) VALUES (?, ?)',
      [week_number, year]
    );
    res.status(201).json({ message: 'Ferienwoche hinzugefügt' });
  } catch (error) {
    console.error('Fehler beim Hinzufügen der Ferienwoche:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/holiday-weeks', async (req, res) => {
  try {
    const { week_number, year } = req.query;
    await pool.query(
      'DELETE FROM holiday_weeks WHERE week_number = ? AND year = ?',
      [week_number, year]
    );
    res.json({ message: 'Ferienwoche entfernt' });
  } catch (error) {
    console.error('Fehler beim Entfernen der Ferienwoche:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bestehende Endpunkte und sonstige Konfiguration...

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
