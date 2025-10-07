import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// CORS-Konfiguration für alle Frontend-URLs
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://tsvrottrainer.azurewebsites.net',     // Production Frontend
      'https://tsvrot-trainer.azurewebsites.net',     // Alternative URL
      'http://localhost:3000',                        // React Dev Server
      'http://localhost:5173',                        // Vite Dev Server
      'http://localhost:4200'                         // Angular Dev Server
    ];
    
    // Allow requests with no origin (Postman, mobile apps)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Datenbank-Konfiguration
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'tsvrot2025-server.mysql.database.azure.com',
  user: process.env.DB_USER || 'rarsmzerix',
  password: process.env.DB_PASSWORD || 'HalloTSVRot2025',
  database: process.env.DB_NAME || 'tsvrot2025-database',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

// Datenbank-Verbindungstest und Tabellen erstellen
async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL Connected successfully');
    
    // Tabellen erstellen falls nicht vorhanden
    await connection.query(`
      CREATE TABLE IF NOT EXISTS trainers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS course_trainers (
        course_id INT NOT NULL,
        trainer_id INT NOT NULL,
        PRIMARY KEY (course_id, trainer_id),
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE CASCADE
      )
    `);
    
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
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS holiday_weeks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        week_number INT NOT NULL,
        year INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_holiday (week_number, year)
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS training_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        week_number INT NOT NULL,
        year INT NOT NULL,
        course_id INT NOT NULL,
        trainer_id INT NOT NULL,
        hours DECIMAL(3,1) DEFAULT 1.0,
        status VARCHAR(20) DEFAULT 'done',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session (week_number, year, trainer_id)
      )
    `);
    
    connection.release();
    console.log('✅ All database tables initialized');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
  }
}

// Initialisiere Datenbank beim Start
initDatabase();

// Request Logging Middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==================== TRAINER ENDPUNKTE ====================

// Alle Trainer abrufen
app.get('/api/trainers', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM trainers ORDER BY last_name, first_name');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching trainers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Einzelnen Trainer abrufen
app.get('/api/trainers/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM trainers WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Trainer not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching trainer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Neuen Trainer erstellen
app.post('/api/trainers', async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;
    
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }
    
    const [result] = await pool.query(
      'INSERT INTO trainers (first_name, last_name, email, phone) VALUES (?, ?, ?, ?)',
      [firstName, lastName, email || null, phone || null]
    );
    
    const [newTrainer] = await pool.query('SELECT * FROM trainers WHERE id = ?', [result.insertId]);
    res.status(201).json(newTrainer[0]);
  } catch (error) {
    console.error('Error creating trainer:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Trainer aktualisieren
app.put('/api/trainers/:id', async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;
    
    const [result] = await pool.query(
      'UPDATE trainers SET first_name = ?, last_name = ?, email = ?, phone = ? WHERE id = ?',
      [firstName, lastName, email || null, phone || null, req.params.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Trainer not found' });
    }
    
    const [updated] = await pool.query('SELECT * FROM trainers WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating trainer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Trainer löschen
app.delete('/api/trainers/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM trainers WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Trainer not found' });
    }
    
    res.json({ message: 'Trainer deleted successfully' });
  } catch (error) {
    console.error('Error deleting trainer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== KURSE ENDPUNKTE ====================

// Alle Kurse abrufen (mit zugewiesenen Trainern)
app.get('/api/courses', async (req, res) => {
  try {
    const [courses] = await pool.query(`
      SELECT c.*, 
             GROUP_CONCAT(ct.trainer_id) as assigned_trainer_ids
      FROM courses c
      LEFT JOIN course_trainers ct ON c.id = ct.course_id
      GROUP BY c.id
      ORDER BY 
        FIELD(c.day_of_week, 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'),
        c.start_time
    `);
    
    // Konvertiere assigned_trainer_ids zu Array
    const formattedCourses = courses.map(course => ({
      ...course,
      assignedTrainerIds: course.assigned_trainer_ids 
        ? course.assigned_trainer_ids.split(',').map(id => parseInt(id))
        : []
    }));
    
    res.json(formattedCourses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Einzelnen Kurs abrufen
app.get('/api/courses/:id', async (req, res) => {
  try {
    const [courses] = await pool.query(`
      SELECT c.*, 
             GROUP_CONCAT(ct.trainer_id) as assigned_trainer_ids
      FROM courses c
      LEFT JOIN course_trainers ct ON c.id = ct.course_id
      WHERE c.id = ?
      GROUP BY c.id
    `, [req.params.id]);
    
    if (courses.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const course = {
      ...courses[0],
      assignedTrainerIds: courses[0].assigned_trainer_ids 
        ? courses[0].assigned_trainer_ids.split(',').map(id => parseInt(id))
        : []
    };
    
    res.json(course);
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Neuen Kurs erstellen
app.post('/api/courses', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { name, dayOfWeek, startTime, endTime, location, category, requiredTrainers, assignedTrainerIds } = req.body;
    
    if (!name || !dayOfWeek || !startTime || !endTime) {
      return res.status(400).json({ error: 'Required fields: name, dayOfWeek, startTime, endTime' });
    }
    
    const [result] = await connection.query(
      `INSERT INTO courses (name, day_of_week, start_time, end_time, location, category, required_trainers) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, dayOfWeek, startTime, endTime, location || null, category || null, requiredTrainers || 1]
    );
    
    // Trainer zuweisen falls vorhanden
    if (assignedTrainerIds && assignedTrainerIds.length > 0) {
      const values = assignedTrainerIds.map(trainerId => [result.insertId, trainerId]);
      await connection.query(
        'INSERT INTO course_trainers (course_id, trainer_id) VALUES ?',
        [values]
      );
    }
    
    await connection.commit();
    
    // Neuen Kurs mit Trainern zurückgeben
    const [newCourse] = await pool.query(`
      SELECT c.*, 
             GROUP_CONCAT(ct.trainer_id) as assigned_trainer_ids
      FROM courses c
      LEFT JOIN course_trainers ct ON c.id = ct.course_id
      WHERE c.id = ?
      GROUP BY c.id
    `, [result.insertId]);
    
    const formattedCourse = {
      ...newCourse[0],
      assignedTrainerIds: newCourse[0].assigned_trainer_ids 
        ? newCourse[0].assigned_trainer_ids.split(',').map(id => parseInt(id))
        : []
    };
    
    res.status(201).json(formattedCourse);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating course:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
});

// Kurs aktualisieren
app.put('/api/courses/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { name, dayOfWeek, startTime, endTime, location, category, requiredTrainers, assignedTrainerIds } = req.body;
    
    const [result] = await connection.query(
      `UPDATE courses 
       SET name = ?, day_of_week = ?, start_time = ?, end_time = ?, 
           location = ?, category = ?, required_trainers = ?
       WHERE id = ?`,
      [name, dayOfWeek, startTime, endTime, location || null, category || null, requiredTrainers || 1, req.params.id]
    );
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Course not found' });
    }
    
    // Trainer-Zuweisungen aktualisieren
    await connection.query('DELETE FROM course_trainers WHERE course_id = ?', [req.params.id]);
    
    if (assignedTrainerIds && assignedTrainerIds.length > 0) {
      const values = assignedTrainerIds.map(trainerId => [req.params.id, trainerId]);
      await connection.query(
        'INSERT INTO course_trainers (course_id, trainer_id) VALUES ?',
        [values]
      );
    }
    
    await connection.commit();
    
    // Aktualisierten Kurs zurückgeben
    const [updated] = await pool.query(`
      SELECT c.*, 
             GROUP_CONCAT(ct.trainer_id) as assigned_trainer_ids
      FROM courses c
      LEFT JOIN course_trainers ct ON c.id = ct.course_id
      WHERE c.id = ?
      GROUP BY c.id
    `, [req.params.id]);
    
    const formattedCourse = {
      ...updated[0],
      assignedTrainerIds: updated[0].assigned_trainer_ids 
        ? updated[0].assigned_trainer_ids.split(',').map(id => parseInt(id))
        : []
    };
    
    res.json(formattedCourse);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating course:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
});

// Kurs löschen
app.delete('/api/courses/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM courses WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== WÖCHENTLICHE ZUWEISUNGEN ====================

app.get('/api/weekly-assignments', async (req, res) => {
  try {
    const { courseId, weekNumber, year } = req.query;
    
    if (!courseId || !weekNumber || !year) {
      return res.status(400).json({ 
        error: 'Missing required parameters: courseId, weekNumber, year' 
      });
    }
    
    const [rows] = await pool.query(
      'SELECT * FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [courseId, weekNumber, year]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching weekly assignments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/weekly-assignments', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { course_id, week_number, year, trainer_ids } = req.body;
    
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ 
        error: 'Missing required fields: course_id, week_number, year' 
      });
    }
    
    await connection.beginTransaction();
    
    // Lösche existierende Zuweisungen
    await connection.query(
      'DELETE FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    
    // Füge neue Zuweisungen hinzu
    if (trainer_ids && trainer_ids.length > 0) {
      const values = trainer_ids.map((id) => [course_id, week_number, year, id]);
      await connection.query(
        'INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES ?',
        [values]
      );
    }
    
    await connection.commit();
    res.status(201).json({ 
      message: 'Weekly assignments updated successfully',
      count: trainer_ids ? trainer_ids.length : 0
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating weekly assignments:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
});

// ==================== KURSAUSFÄLLE ====================

app.get('/api/cancelled-courses', async (req, res) => {
  try {
    const { courseId, weekNumber, year } = req.query;
    
    if (!courseId || !weekNumber || !year) {
      return res.status(400).json({ 
        error: 'Missing required parameters: courseId, weekNumber, year' 
      });
    }
    
    const [rows] = await pool.query(
      'SELECT * FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
      [courseId, weekNumber, year]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching cancelled courses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/cancelled-courses', async (req, res) => {
  try {
    const { course_id, week_number, year, reason } = req.body;
    
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ 
        error: 'Missing required fields: course_id, week_number, year' 
      });
    }
    
    const [result] = await pool.query(
      'INSERT INTO cancelled_courses (course_id, week_number, year, reason) VALUES (?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE reason = VALUES(reason)',
      [course_id, week_number, year, reason || 'Sonstiges']
    );
    
    res.status(201).json({ 
      message: 'Course cancellation added successfully',
      id: result.insertId
    });
  } catch (error) {
    console.error('Error adding cancelled course:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/cancelled-courses', async (req, res) => {
  try {
    const { course_id, week_number, year } = req.query;
    
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ 
        error: 'Missing required parameters: course_id, week_number, year' 
      });
    }
    
    const [result] = await pool.query(
      'DELETE FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cancellation not found' });
    }
    
    res.json({ message: 'Course cancellation removed successfully' });
  } catch (error) {
    console.error('Error removing cancelled course:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== FERIENWOCHEN ====================

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
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/holiday-weeks', async (req, res) => {
  try {
    const { week_number, year } = req.body;
    
    if (!week_number || !year) {
      return res.status(400).json({ 
        error: 'Missing required fields: week_number, year' 
      });
    }
    
    const [result] = await pool.query(
      'INSERT IGNORE INTO holiday_weeks (week_number, year) VALUES (?, ?)',
      [week_number, year]
    );
    
    if (result.affectedRows === 0) {
      return res.status(409).json({ message: 'Holiday week already exists' });
    }
    
    res.status(201).json({ 
      message: 'Holiday week added successfully',
      id: result.insertId
    });
  } catch (error) {
    console.error('Error adding holiday week:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/holiday-weeks', async (req, res) => {
  try {
    const { week_number, year } = req.query;
    
    if (!week_number || !year) {
      return res.status(400).json({ 
        error: 'Missing required parameters: week_number, year' 
      });
    }
    
    const [result] = await pool.query(
      'DELETE FROM holiday_weeks WHERE week_number = ? AND year = ?',
      [week_number, year]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Holiday week not found' });
    }
    
    res.json({ message: 'Holiday week removed successfully' });
  } catch (error) {
    console.error('Error removing holiday week:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== TRAINING SESSIONS ====================

app.post('/api/training-sessions', async (req, res) => {
  try {
    const { week_number, year, course_id, trainer_id, hours, status } = req.body;
    
    if (!week_number || !year || !course_id || !trainer_id) {
      return res.status(400).json({ 
        error: 'Missing required fields: week_number, year, course_id, trainer_id' 
      });
    }
    
    const [result] = await pool.query(
      `INSERT INTO training_sessions (week_number, year, course_id, trainer_id, hours, status) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [week_number, year, course_id, trainer_id, hours || 1.0, status || 'done']
    );
    
    res.status(201).json({ 
      message: 'Training session recorded successfully',
      id: result.insertId
    });
  } catch (error) {
    console.error('Error recording training session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== UTILITY ENDPUNKTE ====================

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const [[dbCheck]] = await pool.query('SELECT 1 as healthy');
    res.json({ 
      status: 'OK', 
      database: 'Connected',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      version: '1.0.0'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'Disconnected',
      error: error.message 
    });
  }
});

// Test Endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'TSV Rot Trainer API is running',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    origin: req.get('origin')
  });
});

// Root Endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'TSV Rot Trainer API',
    version: '1.0.0',
    status: 'Running',
    endpoints: {
      health: '/api/health',
      test: '/api/test',
      trainers: '/api/trainers',
      courses: '/api/courses',
      weeklyAssignments: '/api/weekly-assignments',
      cancelledCourses: '/api/cancelled-courses',
      holidayWeeks: '/api/holiday-weeks',
      trainingSessions: '/api/training-sessions'
    }
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    message: 'Please check the API documentation'
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// Server starten
app.listen(PORT, () => {
  console.log(`🚀 TSV Rot Trainer API running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});