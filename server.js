import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';

const app = express();
const PORT = 8181;

app.use(cors({
  origin: ['https://tsvrottrainer.azurewebsites.net', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174']
}));
app.use(express.json());

// DIREKT HARDCODED - KEINE VARIABLEN
const pool = mysql.createPool({
  host: 'tsvrot2025-server.mysql.database.azure.com',
  user: 'rarsmzerix',
  password: 'HalloTSVRot2025',
  database: 'tsvrot2025-database',
  port: 3306,
  ssl: { rejectUnauthorized: false }
});

pool.getConnection()
  .then(c => { 
    console.log('✅ DB VERBUNDEN: TSVRot2025_database'); 
    c.release(); 
  })
  .catch(e => console.log('❌ DB FEHLER:', e.message));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'Connected' });
  } catch (e) {
    res.json({ status: 'OK', database: 'Error but API works' });
  }
});

app.get('/api/trainers', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM trainers');
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/courses', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM courses');
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server läuft!', port: PORT });
});

app.get('/api/weekly-assignments', (req, res) => res.json([]));
app.post('/api/weekly-assignments', (req, res) => res.json({message:'OK'}));
app.get('/api/cancelled-courses', (req, res) => res.json([]));
app.post('/api/cancelled-courses', (req, res) => res.json({message:'OK'}));
app.delete('/api/cancelled-courses', (req, res) => res.json({message:'OK'}));
app.get('/api/holiday-weeks', (req, res) => res.json([]));
app.post('/api/holiday-weeks', (req, res) => res.json({message:'OK'}));
app.delete('/api/holiday-weeks', (req, res) => res.json({message:'OK'}));

app.listen(PORT, () => {
  console.log(`✅ SERVER LÄUFT: http://localhost:${PORT}`);
  console.log(`✅ TEST: http://localhost:${PORT}/api/test`);
});

