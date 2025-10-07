import express from 'express';
import mysql from 'mysql2/promise';

const app = express();
app.use(express.json());

const pool = mysql.createPool({
  host: 'tsvrot2025-server.mysql.database.azure.com',
  user: 'rarsmzerix',
  password: 'HalloTSVRot2025',
  database: 'tsvrot2025-database',
  ssl: { rejectUnauthorized: false }
});

app.post('/api/test-cancel', async (req, res) => {
  const { course_id, week_number, year } = req.body;
  console.log('Received:', { course_id, week_number, year });
  
  try {
    const result = await pool.query(
      'INSERT INTO cancelled_courses (course_id, week_number, year) VALUES (?, ?, ?)',
      [course_id, week_number, year]
    );
    console.log('Insert result:', result);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Insert error:', error);
    res.json({ error: error.message });
  }
});

app.listen(9999, () => console.log('Test server on 9999'));
