import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8181;

// ✅ UTF-8 Support
app.use(cors({
  origin: ['https://tsvrottrainer.azurewebsites.net', 'https://trainer.tsvrot.de', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174']
}));
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));

// UTF-8 Response Header
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

const pool = mysql.createPool({
  host: 'tsvrot2025-server.mysql.database.azure.com',
  user: 'rarsmzerix',
  password: 'HalloTSVRot2025',
  database: 'tsvrot2025-database',
  port: 3306,
  ssl: { rejectUnauthorized: false },
  charset: 'utf8mb4'  // ✅ UTF-8 Support in MySQL
});

// Test DB Connection
pool.getConnection()
  .then(c => { 
    console.log('✅ DB VERBUNDEN: tsvrot2025-database'); 
    c.release(); 
  })
  .catch(e => console.log('❌ DB FEHLER:', e.message));

// ==================== HEALTH CHECK ====================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'Connected', version: '2.0.0' });
  } catch (e) {
    res.json({ status: 'OK', database: 'Error: ' + e.message });
  }
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server läuft!', port: PORT, version: '2.0.0' });
});

// ==================== TRAINERS ====================
app.get('/api/trainers', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM trainers ORDER BY last_name, first_name');
    
    // Parse JSON Felder und konvertiere zu camelCase
    const trainers = rows.map(row => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      availability: row.availability ? JSON.parse(row.availability) : [],
      qualifications: row.qualifications ? JSON.parse(row.qualifications) : []
    }));
    
    res.json(trainers);
  } catch (e) {
    console.error('Error fetching trainers:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/trainers', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, availability, qualifications } = req.body;
    
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }
    
    const [result] = await pool.query(
      'INSERT INTO trainers (first_name, last_name, email, phone, availability, qualifications) VALUES (?, ?, ?, ?, ?, ?)',
      [
        firstName, 
        lastName, 
        email || null, 
        phone || null,
        JSON.stringify(availability || []),
        JSON.stringify(qualifications || [])
      ]
    );
    
    res.status(201).json({
      id: result.insertId,
      firstName: firstName,
      lastName: lastName,
      email: email || null,
      phone: phone || null,
      availability: availability || [],
      qualifications: qualifications || []
    });
  } catch (error) {
    console.error('Error creating trainer:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/trainers/:id', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, availability, qualifications } = req.body;
    const trainerId = req.params.id;
    
    const [result] = await pool.query(
      'UPDATE trainers SET first_name = ?, last_name = ?, email = ?, phone = ?, availability = ?, qualifications = ? WHERE id = ?',
      [
        firstName, 
        lastName, 
        email || null, 
        phone || null,
        JSON.stringify(availability || []),
        JSON.stringify(qualifications || []),
        trainerId
      ]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Trainer not found' });
    }
    
    res.json({ 
      id: parseInt(trainerId), 
      firstName: firstName, 
      lastName: lastName, 
      email: email || null, 
      phone: phone || null,
      availability: availability || [],
      qualifications: qualifications || []
    });
  } catch (error) {
    console.error('Error updating trainer:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/trainers/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    await connection.query('DELETE FROM course_trainers WHERE trainer_id = ?', [req.params.id]);
    await connection.query('DELETE FROM weekly_assignments WHERE trainer_id = ?', [req.params.id]);
    await connection.query('DELETE FROM training_sessions WHERE trainer_id = ?', [req.params.id]);
    
    const [result] = await connection.query('DELETE FROM trainers WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Trainer not found' });
    }
    
    await connection.commit();
    res.json({ message: 'Trainer deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting trainer:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// ==================== COURSES ====================
app.get('/api/courses', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM courses ORDER BY day_of_week, start_time');
    res.json(rows);
  } catch (e) {
    console.error('Error fetching courses:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/courses', async (req, res) => {
  const { name, dayOfWeek, startTime, endTime, location, category, requiredTrainers } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO courses (name, day_of_week, start_time, end_time, location, category, required_trainers) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, dayOfWeek, startTime, endTime, location || null, category || null, requiredTrainers || 2]
    );
    res.json({ 
      id: result.insertId, 
      name, 
      day_of_week: dayOfWeek, 
      start_time: startTime, 
      end_time: endTime, 
      location, 
      category,
      required_trainers: requiredTrainers || 2
    });
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/courses/:id', async (req, res) => {
  const { name, dayOfWeek, startTime, endTime, location, category, requiredTrainers } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE courses SET name = ?, day_of_week = ?, start_time = ?, end_time = ?, location = ?, category = ?, required_trainers = ? WHERE id = ?',
      [name, dayOfWeek, startTime, endTime, location || null, category || null, requiredTrainers || 2, req.params.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    res.json({ 
      id: parseInt(req.params.id), 
      name, 
      day_of_week: dayOfWeek, 
      start_time: startTime, 
      end_time: endTime, 
      location,
      category,
      required_trainers: requiredTrainers || 2
    });
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/courses/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    await connection.query('DELETE FROM course_trainers WHERE course_id = ?', [req.params.id]);
    await connection.query('DELETE FROM weekly_assignments WHERE course_id = ?', [req.params.id]);
    await connection.query('DELETE FROM cancelled_courses WHERE course_id = ?', [req.params.id]);
    
    const [result] = await connection.query('DELETE FROM courses WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Course not found' });
    }
    
    await connection.commit();
    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting course:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// ==================== WEEKLY ASSIGNMENTS ====================

// Einzelne Assignment (Backward-Compatibility)
app.get('/api/weekly-assignments', async (req, res) => {
  const { courseId, weekNumber, year } = req.query;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [courseId, weekNumber, year]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: error.message });
  }
});

// NEU: Batch-Endpunkt für Performance
app.get('/api/weekly-assignments/batch', async (req, res) => {
  const { weekNumber, year } = req.query;
  
  if (!weekNumber || !year) {
    return res.status(400).json({ error: 'weekNumber and year are required' });
  }

  try {
    const query = `
      SELECT 
        wa.id,
        wa.course_id,
        wa.week_number,
        wa.year,
        wa.trainer_id,
        t.first_name,
        t.last_name
      FROM weekly_assignments wa
      LEFT JOIN trainers t ON wa.trainer_id = t.id
      WHERE wa.week_number = ? AND wa.year = ?
      ORDER BY wa.course_id, wa.trainer_id
    `;
    
    const [assignments] = await pool.query(query, [weekNumber, year]);
    
    const groupedAssignments = assignments.reduce((acc, assignment) => {
      if (!acc[assignment.course_id]) {
        acc[assignment.course_id] = [];
      }
      acc[assignment.course_id].push({
        id: assignment.id,
        trainerId: assignment.trainer_id,
        firstName: assignment.first_name,
        lastName: assignment.last_name
      });
      return acc;
    }, {});
    
    res.json(groupedAssignments);
  } catch (error) {
    console.error('Error fetching batch weekly assignments:', error);
    res.status(500).json({ error: 'Failed to fetch weekly assignments' });
  }
});

// Einzelne Assignment speichern (Backward-Compatibility)
app.post('/api/weekly-assignments', async (req, res) => {
  const { course_id, week_number, year, trainer_ids } = req.body;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    await connection.query(
      'DELETE FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    
    if (trainer_ids && trainer_ids.length > 0) {
      for (const trainer_id of trainer_ids) {
        await connection.query(
          'INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES (?, ?, ?, ?)',
          [course_id, week_number, year, trainer_id]
        );
      }
    }
    
    await connection.commit();
    res.json({ message: 'Assignments updated', count: trainer_ids ? trainer_ids.length : 0 });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating assignments:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// NEU: Batch-Update für Performance
app.post('/api/weekly-assignments/batch', async (req, res) => {
  const { updates, weekNumber, year } = req.body;
  
  if (!updates || !weekNumber || !year) {
    return res.status(400).json({ error: 'updates, weekNumber and year are required' });
  }

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    await connection.query(
      'DELETE FROM weekly_assignments WHERE week_number = ? AND year = ?',
      [weekNumber, year]
    );
    
    for (const [courseId, trainerIds] of Object.entries(updates)) {
      if (trainerIds && trainerIds.length > 0) {
        const values = trainerIds.map(trainerId => 
          [courseId, weekNumber, year, trainerId]
        );
        
        if (values.length > 0) {
          await connection.query(
            'INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES ?',
            [values]
          );
        }
      }
    }
    
    await connection.commit();
    res.json({ success: true, message: 'Batch update successful' });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error in batch update:', error);
    res.status(500).json({ error: 'Failed to update weekly assignments' });
  } finally {
    connection.release();
  }
});

// ==================== CANCELLED COURSES ====================

app.get('/api/cancelled-courses', async (req, res) => {
  const { courseId, weekNumber, year } = req.query;
  try {
    if (courseId && weekNumber && year) {
      const [rows] = await pool.query(
        'SELECT * FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
        [courseId, weekNumber, year]
      );
      res.json(rows);
    } else {
      const [rows] = await pool.query('SELECT * FROM cancelled_courses');
      res.json(rows);
    }
  } catch (error) {
    console.error('Error fetching cancelled courses:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cancelled-courses', async (req, res) => {
  const { course_id, week_number, year, reason } = req.body;
  
  try {
    const [result] = await pool.query(
      'INSERT INTO cancelled_courses (course_id, week_number, year, reason) VALUES (?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE reason = VALUES(reason)',
      [course_id, week_number, year, reason || 'Sonstiges']
    );
    console.log('Course cancelled:', { course_id, week_number, year });
    res.json({ message: 'Course cancelled', insertId: result.insertId });
  } catch (error) {
    console.error('Error cancelling course:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/cancelled-courses', async (req, res) => {
  const { course_id, week_number, year } = req.query;
  
  try {
    const [result] = await pool.query(
      'DELETE FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    console.log('Course reactivated:', { course_id, week_number, year });
    res.json({ message: 'Course reactivated', deleted: result.affectedRows });
  } catch (error) {
    console.error('Error reactivating course:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== HOLIDAY WEEKS ====================

app.get('/api/holiday-weeks', async (req, res) => {
  const { weekNumber, year } = req.query;
  try {
    if (weekNumber && year) {
      const [rows] = await pool.query(
        'SELECT * FROM holiday_weeks WHERE week_number = ? AND year = ?',
        [weekNumber, year]
      );
      res.json(rows);
    } else {
      const [rows] = await pool.query('SELECT * FROM holiday_weeks ORDER BY year DESC, week_number ASC');
      res.json(rows);
    }
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/holiday-weeks', async (req, res) => {
  const { week_number, year } = req.body;
  
  try {
    const [result] = await pool.query(
      'INSERT INTO holiday_weeks (week_number, year) VALUES (?, ?) ' +
      'ON DUPLICATE KEY UPDATE week_number = VALUES(week_number)',
      [week_number, year]
    );
    res.json({ message: 'Holiday week added', insertId: result.insertId });
  } catch (error) {
    console.error('Error adding holiday:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/holiday-weeks', async (req, res) => {
  const { week_number, year } = req.query;
  
  try {
    const [result] = await pool.query(
      'DELETE FROM holiday_weeks WHERE week_number = ? AND year = ?',
      [week_number, year]
    );
    res.json({ message: 'Holiday week removed', deleted: result.affectedRows });
  } catch (error) {
    console.error('Error removing holiday:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== TRAINING SESSIONS ====================

app.post('/api/training-sessions', async (req, res) => {
  const { week_number, year, course_id, trainer_id, hours, status } = req.body;
  
  try {
    const [result] = await pool.query(
      'INSERT INTO training_sessions (week_number, year, course_id, trainer_id, hours, status) VALUES (?, ?, ?, ?, ?, ?)',
      [week_number, year, course_id, trainer_id, hours || 1.0, status || 'done']
    );
    res.json({ message: 'Training session recorded', insertId: result.insertId });
  } catch (error) {
    console.error('Error recording training session:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SERVER START ====================

app.listen(PORT, () => {
  console.log(`✅ SERVER LÄUFT auf Port: ${PORT}`);
  console.log(`✅ Version: 2.0.0`);
  console.log(`✅ Health Check: /api/health`);
});
