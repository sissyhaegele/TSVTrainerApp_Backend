import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8181;

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:5174',
      'https://trainer.tsvrot.de',
      'https://tsvrottrainerapp.azurewebsites.net',
      'https://tsvrottrainer.azurewebsites.net'
    ];
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));

app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'tsvrot2025-server.mysql.database.azure.com',
  user: process.env.DB_USER || 'rarsmzerix',
  password: process.env.DB_PASSWORD || 'HalloTSVRot2025',
  database: process.env.DB_NAME || 'tsvrot2025-database',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false },
  charset: 'utf8mb4'
});

async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL Connected successfully');
    connection.release();
    console.log('✅ Database ready');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
  }
}

initDatabase();

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==================== WOCHENTAG-KONVERTIERUNG ====================

const dayMap = {
  'Montag': 'Monday',
  'Dienstag': 'Tuesday',
  'Mittwoch': 'Wednesday',
  'Donnerstag': 'Thursday',
  'Freitag': 'Friday',
  'Samstag': 'Saturday',
  'Sonntag': 'Sunday'
};

const reverseDayMap = {
  'Monday': 'Montag',
  'Tuesday': 'Dienstag',
  'Wednesday': 'Mittwoch',
  'Thursday': 'Donnerstag',
  'Friday': 'Freitag',
  'Saturday': 'Samstag',
  'Sunday': 'Sonntag'
};

const toEnglishDay = (germanDay) => dayMap[germanDay] || germanDay;
const toGermanDay = (englishDay) => reverseDayMap[englishDay] || englishDay;

// ==================== TRAINER ====================

app.get('/api/trainers', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM trainers WHERE is_active = 1 ORDER BY last_name, first_name');
    
    const trainers = rows.map(row => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      availability: row.availability ? JSON.parse(row.availability) : [],
      qualifications: row.qualifications ? JSON.parse(row.qualifications) : [],
      isActive: row.is_active,
      notes: row.notes
    }));
    
    res.json(trainers);
  } catch (error) {
    console.error('Error fetching trainers:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/trainers/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM trainers WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Trainer not found' });
    
    const trainer = rows[0];
    res.json({
      id: trainer.id,
      firstName: trainer.first_name,
      lastName: trainer.last_name,
      email: trainer.email,
      phone: trainer.phone,
      availability: trainer.availability ? JSON.parse(trainer.availability) : [],
      qualifications: trainer.qualifications ? JSON.parse(trainer.qualifications) : [],
      isActive: trainer.is_active,
      notes: trainer.notes
    });
  } catch (error) {
    console.error('Error fetching trainer:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
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
      qualifications: qualifications || [],
      isActive: true
    });
  } catch (error) {
    console.error('Error creating trainer:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
});

app.put('/api/trainers/:id', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, availability, qualifications } = req.body;
    
    const [result] = await pool.query(
      'UPDATE trainers SET first_name = ?, last_name = ?, email = ?, phone = ?, availability = ?, qualifications = ? WHERE id = ?',
      [
        firstName, 
        lastName, 
        email || null, 
        phone || null,
        JSON.stringify(availability || []),
        JSON.stringify(qualifications || []),
        req.params.id
      ]
    );
    
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Trainer not found' });
    
    res.json({ 
      id: parseInt(req.params.id), 
      firstName: firstName, 
      lastName: lastName, 
      email: email || null, 
      phone: phone || null,
      availability: availability || [],
      qualifications: qualifications || []
    });
  } catch (error) {
    console.error('Error updating trainer:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
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
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    connection.release();
  }
});

// ==================== COURSES ====================

app.get('/api/courses', async (req, res) => {
  try {
    const [courses] = await pool.query(`
      SELECT c.*, GROUP_CONCAT(ct.trainer_id) as assigned_trainer_ids
      FROM courses c
      LEFT JOIN course_trainers ct ON c.id = ct.course_id
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY FIELD(c.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'), c.start_time
    `);
    
    const formattedCourses = courses.map(course => ({
      id: course.id,
      name: course.name,
      description: course.description,
      dayOfWeek: toGermanDay(course.day_of_week),
      startTime: course.start_time,
      endTime: course.end_time,
      location: course.location,
      category: course.category,
      requiredTrainers: course.required_trainers,
      isActive: course.is_active,
      assignedTrainerIds: course.assigned_trainer_ids 
        ? course.assigned_trainer_ids.split(',').map(id => parseInt(id))
        : []
    }));
    
    res.json(formattedCourses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/api/courses', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { name, dayOfWeek, startTime, endTime, location, category, requiredTrainers, assignedTrainerIds } = req.body;
    
    if (!name || !dayOfWeek || !startTime || !endTime) {
      return res.status(400).json({ error: 'Required fields: name, dayOfWeek, startTime, endTime' });
    }
    
    const englishDay = toEnglishDay(dayOfWeek);
    
    const [result] = await connection.query(
      'INSERT INTO courses (name, day_of_week, start_time, end_time, location, category, required_trainers) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, englishDay, startTime, endTime, location || null, category || null, requiredTrainers || 1]
    );
    
    if (assignedTrainerIds && assignedTrainerIds.length > 0) {
      const values = assignedTrainerIds.map(trainerId => [result.insertId, trainerId]);
      await connection.query('INSERT INTO course_trainers (course_id, trainer_id) VALUES ?', [values]);
    }
    
    await connection.commit();
    
    res.status(201).json({
      id: result.insertId,
      name,
      dayOfWeek: dayOfWeek,
      startTime,
      endTime,
      location,
      category,
      requiredTrainers: requiredTrainers || 1,
      assignedTrainerIds: assignedTrainerIds || []
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating course:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    connection.release();
  }
});

app.put('/api/courses/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { name, dayOfWeek, startTime, endTime, location, category, requiredTrainers, assignedTrainerIds } = req.body;
    
    const englishDay = toEnglishDay(dayOfWeek);
    
    const [result] = await connection.query(
      'UPDATE courses SET name = ?, day_of_week = ?, start_time = ?, end_time = ?, location = ?, category = ?, required_trainers = ? WHERE id = ?',
      [name, englishDay, startTime, endTime, location || null, category || null, requiredTrainers || 1, req.params.id]
    );
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Course not found' });
    }
    
    await connection.query('DELETE FROM course_trainers WHERE course_id = ?', [req.params.id]);
    if (assignedTrainerIds && assignedTrainerIds.length > 0) {
      const values = assignedTrainerIds.map(trainerId => [req.params.id, trainerId]);
      await connection.query('INSERT INTO course_trainers (course_id, trainer_id) VALUES ?', [values]);
    }
    
    await connection.commit();
    
    res.json({
      id: parseInt(req.params.id),
      name,
      dayOfWeek: dayOfWeek,
      startTime,
      endTime,
      location,
      category,
      requiredTrainers: requiredTrainers || 1,
      assignedTrainerIds: assignedTrainerIds || []
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating course:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    connection.release();
  }
});

app.delete('/api/courses/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM courses WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Course not found' });
    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ==================== WEEKLY ASSIGNMENTS ====================

app.get('/api/weekly-assignments', async (req, res) => {
  try {
    const { courseId, weekNumber, year } = req.query;
    if (!courseId || !weekNumber || !year) {
      return res.status(400).json({ error: 'Missing required parameters: courseId, weekNumber, year' });
    }
    
    const [rows] = await pool.query(
      'SELECT * FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [courseId, weekNumber, year]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching weekly assignments:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/weekly-assignments/batch', async (req, res) => {
  const { weekNumber, year } = req.query;
  if (!weekNumber || !year) {
    return res.status(400).json({ error: 'weekNumber and year are required' });
  }

  try {
    const [assignments] = await pool.query(`
      SELECT wa.id, wa.course_id, wa.week_number, wa.year, wa.trainer_id,
             t.first_name, t.last_name
      FROM weekly_assignments wa
      LEFT JOIN trainers t ON wa.trainer_id = t.id
      WHERE wa.week_number = ? AND wa.year = ?
      ORDER BY wa.course_id, wa.trainer_id
    `, [weekNumber, year]);
    
    const groupedAssignments = assignments.reduce((acc, assignment) => {
      if (!acc[assignment.course_id]) acc[assignment.course_id] = [];
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
    res.status(500).json({ error: 'Failed to fetch weekly assignments', details: error.message });
  }
});

app.post('/api/weekly-assignments', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { course_id, week_number, year, trainer_ids } = req.body;
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ error: 'Missing required fields: course_id, week_number, year' });
    }
    
    await connection.beginTransaction();
    await connection.query(
      'DELETE FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    
    if (trainer_ids && trainer_ids.length > 0) {
      const values = trainer_ids.map((id) => [course_id, week_number, year, id]);
      await connection.query('INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES ?', [values]);
    }
    
    await connection.commit();
    res.status(201).json({ message: 'Weekly assignments updated successfully', count: trainer_ids ? trainer_ids.length : 0 });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating weekly assignments:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    connection.release();
  }
});

app.post('/api/weekly-assignments/batch', async (req, res) => {
  const { updates, weekNumber, year } = req.body;
  if (!updates || !weekNumber || !year) {
    return res.status(400).json({ error: 'updates, weekNumber and year are required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM weekly_assignments WHERE week_number = ? AND year = ?', [weekNumber, year]);
    
    for (const [courseId, trainerIds] of Object.entries(updates)) {
      if (trainerIds && trainerIds.length > 0) {
        const values = trainerIds.map(trainerId => [courseId, weekNumber, year, trainerId]);
        if (values.length > 0) {
          await connection.query('INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES ?', [values]);
        }
      }
    }
    
    await connection.commit();
    res.json({ success: true, message: 'Batch update successful' });
  } catch (error) {
    await connection.rollback();
    console.error('Error in batch update:', error);
    res.status(500).json({ error: 'Failed to update weekly assignments', details: error.message });
  } finally {
    connection.release();
  }
});

// ==================== CANCELLED COURSES ====================

app.get('/api/cancelled-courses', async (req, res) => {
  try {
    const { courseId, weekNumber, year } = req.query;
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
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/api/cancelled-courses', async (req, res) => {
  try {
    const { course_id, week_number, year, reason } = req.body;
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ error: 'Missing required fields: course_id, week_number, year' });
    }
    
    const [result] = await pool.query(
      'INSERT INTO cancelled_courses (course_id, week_number, year, reason) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason)',
      [course_id, week_number, year, reason || 'Sonstiges']
    );
    
    res.status(201).json({ message: 'Course cancellation added successfully', id: result.insertId });
  } catch (error) {
    console.error('Error adding cancelled course:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.delete('/api/cancelled-courses', async (req, res) => {
  try {
    const { course_id, week_number, year } = req.query;
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ error: 'Missing required parameters: course_id, week_number, year' });
    }
    
    const [result] = await pool.query(
      'DELETE FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Cancellation not found' });
    res.json({ message: 'Course cancellation removed successfully' });
  } catch (error) {
    console.error('Error removing cancelled course:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ==================== HOLIDAY WEEKS ====================

app.get('/api/holiday-weeks', async (req, res) => {
  try {
    const { weekNumber, year } = req.query;
    let query = 'SELECT * FROM holiday_weeks';
    const params = [];
    
    if (weekNumber && year) {
      query += ' WHERE week_number = ? AND year = ?';
      params.push(weekNumber, year);
    } else if (year) {
      query += ' WHERE year = ?';
      params.push(year);
    }
    
    query += ' ORDER BY year DESC, week_number ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching holiday weeks:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/api/holiday-weeks', async (req, res) => {
  try {
    const { week_number, year } = req.body;
    if (!week_number || !year) {
      return res.status(400).json({ error: 'Missing required fields: week_number, year' });
    }
    
    const [result] = await pool.query('INSERT IGNORE INTO holiday_weeks (week_number, year) VALUES (?, ?)', [week_number, year]);
    if (result.affectedRows === 0) return res.status(409).json({ message: 'Holiday week already exists' });
    res.status(201).json({ message: 'Holiday week added successfully', id: result.insertId });
  } catch (error) {
    console.error('Error adding holiday week:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.delete('/api/holiday-weeks', async (req, res) => {
  try {
    const { week_number, year } = req.query;
    if (!week_number || !year) {
      return res.status(400).json({ error: 'Missing required parameters: week_number, year' });
    }
    
    const [result] = await pool.query('DELETE FROM holiday_weeks WHERE week_number = ? AND year = ?', [week_number, year]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Holiday week not found' });
    res.json({ message: 'Holiday week removed successfully' });
  } catch (error) {
    console.error('Error removing holiday week:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ============================================
// TRAINER-STUNDEN TRACKING ENDPOINTS
// ============================================

app.get('/api/trainer-hours/:year', async (req, res) => {
  try {
    const { year } = req.params;
    console.log(`[TRAINER-HOURS] Fetching hours for year: ${year}`);
    
    // Nur Stunden ab Oktober 2025 zählen
    const cutoffDate = '2025-10-01 00:00:00';
    
    const query = `
      SELECT 
        trainer_id,
        SUM(hours) as total_hours,
        COUNT(*) as total_sessions,
        MAX(created_at) as last_session
      FROM training_sessions
      WHERE year = ? 
        AND status = 'done'
        AND created_at >= ?
      GROUP BY trainer_id
    `;
    
    const [results] = await pool.query(query, [year, cutoffDate]);
    console.log(`[TRAINER-HOURS] Found ${results.length} trainers with hours (since Oct 2025)`);
    
    const hours = {};
    results.forEach(row => {
      hours[row.trainer_id] = {
        totalHours: parseFloat(row.total_hours) || 0,
        totalSessions: row.total_sessions || 0,
        lastSession: row.last_session
      };
    });
    
    res.json(hours);
  } catch (error) {
    console.error('[TRAINER-HOURS] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ALTERNATIVE: Nur aktuelles Kalenderjahr zählen (auto-reset am 01.01.)
// app.get('/api/trainer-hours/:year', async (req, res) => {
//   try {
//     const { year } = req.params;
//     console.log(`[TRAINER-HOURS] Fetching hours for year: ${year}`);
//     
//     // Berechne Start des Jahres
//     const yearStart = `${year}-01-01 00:00:00`;
//     const yearEnd = `${year}-12-31 23:59:59`;
//     
//     const query = `
//       SELECT 
//         trainer_id,
//         SUM(hours) as total_hours,
//         COUNT(*) as total_sessions,
//         MAX(created_at) as last_session
//       FROM training_sessions
//       WHERE status = 'done'
//         AND created_at >= ?
//         AND created_at <= ?
//       GROUP BY trainer_id
//     `;
//     
//     const [results] = await pool.query(query, [yearStart, yearEnd]);
//     console.log(`[TRAINER-HOURS] Found ${results.length} trainers with hours in ${year}`);
//     
//     const hours = {};
//     results.forEach(row => {
//       hours[row.trainer_id] = {
//         totalHours: parseFloat(row.total_hours) || 0,
//         totalSessions: row.total_sessions || 0,
//         lastSession: row.last_session
//       };
//     });
//     
//     res.json(hours);
//   } catch (error) {
//     console.error('[TRAINER-HOURS] Error:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

app.get('/api/trainer-hours/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    console.log(`[TRAINER-HOURS] Fetching hours for ${year}-${month}`);
    
    const query = `
      SELECT 
        trainer_id,
        SUM(hours) as monthly_hours,
        COUNT(*) as monthly_sessions
      FROM training_sessions
      WHERE year = ? AND MONTH(created_at) = ? AND status = 'done'
      GROUP BY trainer_id
    `;
    
    const [results] = await pool.query(query, [year, month]);
    console.log(`[TRAINER-HOURS] Found ${results.length} trainers with monthly hours`);
    
    const hours = {};
    results.forEach(row => {
      hours[row.trainer_id] = {
        monthlyHours: parseFloat(row.monthly_hours) || 0,
        monthlySessions: row.monthly_sessions || 0
      };
    });
    
    res.json(hours);
  } catch (error) {
    console.error('[TRAINER-HOURS] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ NEU: Prüfe ob Woche bereits gespeichert wurde
app.get('/api/training-sessions/week/:weekNumber/:year', async (req, res) => {
  try {
    const { weekNumber, year } = req.params;
    console.log(`[CHECK-WEEK] Checking if KW ${weekNumber}/${year} has entries`);
    
    const query = `
      SELECT id, course_id, trainer_id, hours, status
      FROM training_sessions
      WHERE week_number = ? AND year = ?
      LIMIT 1
    `;
    
    const [results] = await pool.query(query, [weekNumber, year]);
    
    // Gibt leeres Array zurück wenn keine Einträge, sonst die Einträge
    res.json(results);
  } catch (error) {
    console.error('[CHECK-WEEK] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/training-sessions', async (req, res) => {
  try {
    const { week_number, year, course_id, trainer_id, hours, status = 'done' } = req.body;
    console.log(`[TRAINING-SESSION] Saving: Week ${week_number}/${year}, Course ${course_id}, Trainer ${trainer_id}, Hours ${hours}`);
    
    if (!week_number || !year || !course_id || !trainer_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // ✅ VALIDATION: Reject entries before October 2025
    if (year < 2025 || (year === 2025 && week_number < 40)) {
      return res.status(400).json({ 
        error: 'Cannot save training sessions before October 2025 (KW 40)', 
        provided: `KW ${week_number}/${year}` 
      });
    }
    
    const query = `
      INSERT INTO training_sessions (week_number, year, course_id, trainer_id, hours, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await pool.query(query, [
      week_number, year, course_id, trainer_id, hours || 1.0, status
    ]);
    
    console.log(`[TRAINING-SESSION] Saved with ID: ${result.insertId}`);
    res.json({ id: result.insertId, message: 'Training session saved successfully' });
  } catch (error) {
    console.error('[TRAINING-SESSION] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/training-sessions/trainer/:trainerId/:year', async (req, res) => {
  try {
    const { trainerId, year } = req.params;
    const query = `
      SELECT 
        ts.*,
        c.name as course_name,
        t.first_name,
        t.last_name
      FROM training_sessions ts
      LEFT JOIN courses c ON ts.course_id = c.id
      LEFT JOIN trainers t ON ts.trainer_id = t.id
      WHERE ts.trainer_id = ? AND ts.year = ?
      ORDER BY ts.week_number DESC
    `;
    const [results] = await pool.query(query, [trainerId, year]);
    res.json(results);
  } catch (error) {
    console.error('[TRAINING-SESSIONS] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Ende TRAINER-STUNDEN ENDPOINTS
// ============================================

// ==================== KONFLIKT-DETECTION ====================

app.post('/api/check-conflicts', async (req, res) => {
  const { weekNumber, year, lastSync } = req.body;
  
  try {
    const query = `
      SELECT 'weekly_assignment' as type, course_id, last_modified, modified_by
      FROM weekly_assignments
      WHERE week_number = ? AND year = ? AND last_modified > ?
      UNION ALL
      SELECT 'cancelled_course' as type, course_id, last_modified, modified_by
      FROM cancelled_courses
      WHERE week_number = ? AND year = ? AND last_modified > ?
      UNION ALL
      SELECT 'holiday_week' as type, NULL as course_id, last_modified, modified_by
      FROM holiday_weeks
      WHERE week_number = ? AND year = ? AND last_modified > ?
    `;
    
    const [conflicts] = await pool.query(query, 
      [weekNumber, year, lastSync, weekNumber, year, lastSync, weekNumber, year, lastSync]
    );
    
    res.json(conflicts.length > 0 ? { hasConflicts: true, conflicts } : { hasConflicts: false });
  } catch (error) {
    console.error('Error checking conflicts:', error);
    res.status(500).json({ error: 'Failed to check conflicts', details: error.message });
  }
});

// ==================== UTILITY ====================

app.get('/api/health', async (req, res) => {
  try {
    const [[dbCheck]] = await pool.query('SELECT 1 as healthy');
    res.json({ 
      status: 'OK', 
      database: 'Connected',
      timestamp: new Date().toISOString(),
      version: '2.0.5'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ status: 'ERROR', database: 'Disconnected', error: error.message });
  }
});

app.get('/api/test', (req, res) => {
  res.json({
    message: 'TSV Rot Trainer API is running',
    timestamp: new Date().toISOString(),
    version: '2.0.5',
    features: ['UTF-8', 'Wochentag-Konvertierung', 'availability/qualifications', 'is_active filter', 'trainer-hours tracking', 'October 2025 cutoff', 'duplicate prevention']
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'TSV Rot Trainer API',
    version: '2.0.5',
    status: 'Running',
    endpoints: {
      health: '/api/health',
      trainers: '/api/trainers',
      courses: '/api/courses',
      weeklyAssignments: '/api/weekly-assignments',
      weeklyAssignmentsBatch: '/api/weekly-assignments/batch',
      cancelledCourses: '/api/cancelled-courses',
      holidayWeeks: '/api/holiday-weeks',
      trainingSessions: '/api/training-sessions',
      checkWeek: '/api/training-sessions/week/:weekNumber/:year',
      trainerHours: '/api/trainer-hours/:year',
      trainerHoursMonth: '/api/trainer-hours/:year/:month',
      checkConflicts: '/api/check-conflicts'
    },
    cutoffDate: '2025-10-01',
    note: 'Training sessions before October 2025 (KW 40) will be rejected'
  });
});

// ==================== ERROR HANDLERS ====================
// WICHTIG: Diese müssen GANZ AM ENDE stehen!

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path, method: req.method });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 TSV Rot Trainer API v2.0.5 running on port ${PORT}`);
  console.log(`🔗 Health: http://localhost:${PORT}/api/health`);
  console.log(`✅ UTF-8 Support enabled`);
  console.log(`✅ Wochentag-Konvertierung: Deutsch ↔ Englisch`);
  console.log(`✅ Batch endpoints enabled`);
  console.log(`✅ is_active filter enabled`);
  console.log(`✅ Trainer-hours tracking enabled`);
  console.log(`✅ October 2025 cutoff enabled`);
  console.log(`✅ Duplicate prevention via DB check`);
});
