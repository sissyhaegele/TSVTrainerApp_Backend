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

// ==================== HILFSFUNKTIONEN v2.5.0 ====================

// Berechne Sonntag einer Woche
const getWeekEndDate = (weekNumber, year) => {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayNum = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() - dayNum + 1);
  
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() + (weekNumber - 1) * 7);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  
  return weekEnd;
};

// v2.5.0: Prüfe ob Woche in der Vergangenheit oder heute liegt (≤ heute)
const isWeekInPastOrToday = (weekNumber, year) => {
  const weekEndDate = getWeekEndDate(weekNumber, year);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  return weekEndDate <= today;
};

// v2.5.0: Berechne Stunden aus Kurs
const calculateCourseHours = (startTime, endTime) => {
  if (!startTime || !endTime) return 1;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  return (endH + endM / 60) - (startH + startM / 60);
};

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

// ==================== WEEKLY ASSIGNMENTS v2.5.0 ====================

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

// v2.5.0: POST mit Addier/Subtrahier-Logik
app.post('/api/weekly-assignments', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { course_id, week_number, year, trainer_ids } = req.body;
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ error: 'Missing required fields: course_id, week_number, year' });
    }
    
    await connection.beginTransaction();
    
    // Hole alte Zuweisungen
    const [oldAssignments] = await connection.query(
      'SELECT trainer_id FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    const oldTrainerIds = oldAssignments.map(a => a.trainer_id);
    
    // Bestimme: hinzugefügt, entfernt
    const toAdd = (trainer_ids || []).filter(id => !oldTrainerIds.includes(id));
    const toRemove = oldTrainerIds.filter(id => !(trainer_ids || []).includes(id));
    
    // Update weekly_assignments
    await connection.query(
      'DELETE FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    
    if (trainer_ids && trainer_ids.length > 0) {
      const values = trainer_ids.map((id) => [course_id, week_number, year, id]);
      await connection.query('INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES ?', [values]);
    }
    
    // v2.5.0: Sync zu training_sessions (nur wenn Woche in Vergangenheit/heute)
    if (isWeekInPastOrToday(week_number, year)) {
      // Hole Kurs-Details
      const [courseData] = await connection.query(
        'SELECT start_time, end_time FROM courses WHERE id = ?',
        [course_id]
      );
      
      if (courseData && courseData.length > 0) {
        const hours = calculateCourseHours(courseData[0].start_time, courseData[0].end_time);
        
        // Prüfe ob Kurs ausgefallen oder Ferienwoche
        const [cancelledCheck] = await connection.query(
          'SELECT id FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
          [course_id, week_number, year]
        );
        
        const [holidayCheck] = await connection.query(
          'SELECT id FROM holiday_weeks WHERE week_number = ? AND year = ?',
          [week_number, year]
        );
        
        const isCancelled = cancelledCheck.length > 0 || holidayCheck.length > 0;
        
        // Addiere: Füge neue Trainer hinzu
        if (!isCancelled) {
          for (const trainerId of toAdd) {
            await connection.query(
              `INSERT IGNORE INTO training_sessions 
               (week_number, year, course_id, trainer_id, hours, status, recorded_by)
               VALUES (?, ?, ?, ?, ?, 'recorded', 'system')`,
              [week_number, year, course_id, trainerId, hours.toFixed(2)]
            );
            console.log(`➕ Stunde hinzugefügt: Trainer ${trainerId} KW ${week_number}/${year} (+${hours.toFixed(2)}h)`);
          }
        }
        
        // Subtrahiere: Entferne alte Trainer
        for (const trainerId of toRemove) {
          await connection.query(
            'DELETE FROM training_sessions WHERE course_id = ? AND week_number = ? AND year = ? AND trainer_id = ?',
            [course_id, week_number, year, trainerId]
          );
          console.log(`➖ Stunde entfernt: Trainer ${trainerId} KW ${week_number}/${year} (-${hours.toFixed(2)}h)`);
        }
      }
    }
    
    await connection.commit();
    res.status(201).json({ 
      message: 'Weekly assignments updated successfully', 
      added: toAdd.length,
      removed: toRemove.length
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating weekly assignments:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    connection.release();
  }
});

// v2.5.0: Batch mit Addier/Subtrahier-Logik
app.post('/api/weekly-assignments/batch', async (req, res) => {
  const { updates, weekNumber, year } = req.body;
  if (!updates || !weekNumber || !year) {
    return res.status(400).json({ error: 'updates, weekNumber and year are required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const isInPast = isWeekInPastOrToday(weekNumber, year);
    
    // Hole alle alten Zuweisungen für diese Woche
    const [allOldAssignments] = await connection.query(
      'SELECT course_id, trainer_id FROM weekly_assignments WHERE week_number = ? AND year = ?',
      [weekNumber, year]
    );
    
    // Lösche alle alten Zuweisungen
    await connection.query('DELETE FROM weekly_assignments WHERE week_number = ? AND year = ?', [weekNumber, year]);
    
    // Speichere neue Zuweisungen und sync zu training_sessions
    for (const [courseId, trainerIds] of Object.entries(updates)) {
      if (trainerIds && trainerIds.length > 0) {
        const values = trainerIds.map(trainerId => [courseId, weekNumber, year, trainerId]);
        await connection.query('INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES ?', [values]);
        
        // v2.5.0: Sync nur wenn Woche in Vergangenheit/heute
        if (isInPast) {
          const oldTrainerIds = allOldAssignments
            .filter(a => a.course_id === parseInt(courseId))
            .map(a => a.trainer_id);
          
          const toAdd = trainerIds.filter(id => !oldTrainerIds.includes(id));
          const toRemove = oldTrainerIds.filter(id => !trainerIds.includes(id));
          
          // Hole Kurs-Details
          const [courseData] = await connection.query(
            'SELECT start_time, end_time FROM courses WHERE id = ?',
            [courseId]
          );
          
          if (courseData && courseData.length > 0) {
            const hours = calculateCourseHours(courseData[0].start_time, courseData[0].end_time);
            
            // Prüfe Ausfall/Ferienwoche
            const [cancelledCheck] = await connection.query(
              'SELECT id FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
              [courseId, weekNumber, year]
            );
            
            const [holidayCheck] = await connection.query(
              'SELECT id FROM holiday_weeks WHERE week_number = ? AND year = ?',
              [weekNumber, year]
            );
            
            const isCancelled = cancelledCheck.length > 0 || holidayCheck.length > 0;
            
            if (!isCancelled) {
              // Hinzufügen
              for (const trainerId of toAdd) {
                await connection.query(
                  `INSERT IGNORE INTO training_sessions 
                   (week_number, year, course_id, trainer_id, hours, status, recorded_by)
                   VALUES (?, ?, ?, ?, ?, 'recorded', 'system')`,
                  [weekNumber, year, courseId, trainerId, hours.toFixed(2)]
                );
              }
              
              // Entfernen
              for (const trainerId of toRemove) {
                await connection.query(
                  'DELETE FROM training_sessions WHERE course_id = ? AND week_number = ? AND year = ? AND trainer_id = ?',
                  [courseId, weekNumber, year, trainerId]
                );
              }
            }
          }
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

// ==================== CANCELLED COURSES v2.5.0 ====================

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

// v2.5.0: POST mit Addier/Subtrahier-Logik
app.post('/api/cancelled-courses', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { course_id, week_number, year, reason } = req.body;
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    await connection.beginTransaction();
    
    // Speichere Ausfall
    await connection.query(
      'INSERT INTO cancelled_courses (course_id, week_number, year, reason) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason)',
      [course_id, week_number, year, reason || 'Sonstiges']
    );
    
    // v2.5.0: Lösche training_sessions für diesen Kurs/Woche (Stunden abziehen)
    if (isWeekInPastOrToday(week_number, year)) {
      await connection.query(
        'DELETE FROM training_sessions WHERE course_id = ? AND week_number = ? AND year = ?',
        [course_id, week_number, year]
      );
      console.log(`🚫 Stunden gelöscht: Kurs ${course_id} KW ${week_number}/${year} ausgefallen`);
    }
    
    await connection.commit();
    res.status(201).json({ message: 'Course cancellation added successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error adding cancelled course:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    connection.release();
  }
});

// v2.5.0: DELETE mit Addier/Subtrahier-Logik (Re-Insert)
app.delete('/api/cancelled-courses', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { course_id, week_number, year } = req.query;
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    await connection.beginTransaction();
    
    // Lösche Ausfall-Markierung
    await connection.query(
      'DELETE FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    
    // v2.5.0: Re-Insert training_sessions (Stunden wieder hinzufügen)
    if (isWeekInPastOrToday(parseInt(week_number), parseInt(year))) {
      // Hole Trainer-Zuweisungen
      const [assignments] = await connection.query(
        'SELECT trainer_id FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
        [course_id, week_number, year]
      );
      
      // Hole Kurs-Details
      const [courseData] = await connection.query(
        'SELECT start_time, end_time FROM courses WHERE id = ?',
        [course_id]
      );
      
      if (courseData && courseData.length > 0) {
        const hours = calculateCourseHours(courseData[0].start_time, courseData[0].end_time);
        
        // Prüfe ob nicht auch Ferienwoche ist
        const [holidayCheck] = await connection.query(
          'SELECT id FROM holiday_weeks WHERE week_number = ? AND year = ?',
          [week_number, year]
        );
        
        if (holidayCheck.length === 0) {
          // Re-insert für alle zugewiesenen Trainer
          for (const assignment of assignments) {
            await connection.query(
              `INSERT IGNORE INTO training_sessions 
               (week_number, year, course_id, trainer_id, hours, status, recorded_by)
               VALUES (?, ?, ?, ?, ?, 'recorded', 'system')`,
              [week_number, year, course_id, assignment.trainer_id, hours.toFixed(2)]
            );
          }
          console.log(`✅ Stunden wiederhergestellt: Kurs ${course_id} KW ${week_number}/${year} reaktiviert`);
        }
      }
    }
    
    await connection.commit();
    res.json({ message: 'Course cancellation removed successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error removing cancelled course:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    connection.release();
  }
});

// ==================== HOLIDAY WEEKS v2.5.0 ====================

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

// v2.5.0: POST mit Addier/Subtrahier-Logik
app.post('/api/holiday-weeks', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { week_number, year } = req.body;
    if (!week_number || !year) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    await connection.beginTransaction();
    
    // Speichere Ferienwoche
    await connection.query('INSERT IGNORE INTO holiday_weeks (week_number, year) VALUES (?, ?)', [week_number, year]);
    
    // v2.5.0: Lösche ALLE training_sessions für diese Woche
    if (isWeekInPastOrToday(week_number, year)) {
      await connection.query(
        'DELETE FROM training_sessions WHERE week_number = ? AND year = ?',
        [week_number, year]
      );
      console.log(`🏖️ Stunden gelöscht: KW ${week_number}/${year} Ferienwoche`);
    }
    
    await connection.commit();
    res.status(201).json({ message: 'Holiday week added successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error adding holiday week:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    connection.release();
  }
});

// v2.5.0: DELETE mit Addier/Subtrahier-Logik (Re-Insert)
app.delete('/api/holiday-weeks', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { week_number, year } = req.query;
    if (!week_number || !year) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    await connection.beginTransaction();
    
    // Lösche Ferienwoche-Markierung
    await connection.query('DELETE FROM holiday_weeks WHERE week_number = ? AND year = ?', [week_number, year]);
    
    // v2.5.0: Re-Insert training_sessions (Stunden wieder hinzufügen)
    if (isWeekInPastOrToday(parseInt(week_number), parseInt(year))) {
      // Hole alle Zuweisungen dieser Woche
      const [assignments] = await connection.query(
        'SELECT DISTINCT course_id, trainer_id FROM weekly_assignments WHERE week_number = ? AND year = ?',
        [week_number, year]
      );
      
      for (const assignment of assignments) {
        // Prüfe ob Kurs nicht auch einzeln ausgefallen ist
        const [cancelledCheck] = await connection.query(
          'SELECT id FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
          [assignment.course_id, week_number, year]
        );
        
        if (cancelledCheck.length === 0) {
          // Hole Kurs-Details
          const [courseData] = await connection.query(
            'SELECT start_time, end_time FROM courses WHERE id = ?',
            [assignment.course_id]
          );
          
          if (courseData && courseData.length > 0) {
            const hours = calculateCourseHours(courseData[0].start_time, courseData[0].end_time);
            
            await connection.query(
              `INSERT IGNORE INTO training_sessions 
               (week_number, year, course_id, trainer_id, hours, status, recorded_by)
               VALUES (?, ?, ?, ?, ?, 'recorded', 'system')`,
              [week_number, year, assignment.course_id, assignment.trainer_id, hours.toFixed(2)]
            );
          }
        }
      }
      
      console.log(`✅ Stunden wiederhergestellt: KW ${week_number}/${year} Ferien aufgehoben`);
    }
    
    await connection.commit();
    res.json({ message: 'Holiday week removed successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error removing holiday week:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    connection.release();
  }
});

// ==================== TRAINING SESSIONS ====================

app.get('/api/training-sessions/week/:weekNumber/:year/check', async (req, res) => {
  const { weekNumber, year } = req.params;
  
  try {
    const [results] = await pool.query(
      `SELECT COUNT(*) as count, ROUND(SUM(hours), 2) as totalHours 
       FROM training_sessions 
       WHERE week_number = ? AND year = ? AND status = 'recorded'`,
      [parseInt(weekNumber), parseInt(year)]
    );
    
    const weekSaved = results[0].count > 0;
    
    res.json({
      weekNumber: parseInt(weekNumber),
      year: parseInt(year),
      weekSaved,
      sessionCount: results[0].count,
      totalHours: results[0].totalHours || 0
    });
  } catch (error) {
    console.error('Fehler bei week check:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trainer-hours/:trainerId/:year', async (req, res) => {
  const { trainerId, year } = req.params;
  
  try {
    const [results] = await pool.query(
      `SELECT 
         t.id,
         t.first_name,
         t.last_name,
         ROUND(SUM(ts.hours), 2) as totalHours,
         COUNT(ts.id) as sessionCount,
         MAX(ts.recorded_at) as lastRecorded
       FROM training_sessions ts
       JOIN trainers t ON ts.trainer_id = t.id
       WHERE ts.trainer_id = ? AND ts.year = ? AND ts.status = 'recorded'
       GROUP BY t.id, t.first_name, t.last_name`,
      [parseInt(trainerId), parseInt(year)]
    );
    
    if (results.length === 0) {
      return res.json({
        trainerId: parseInt(trainerId),
        year: parseInt(year),
        totalHours: 0,
        sessionCount: 0
      });
    }
    
    const row = results[0];
    res.json({
      trainerId: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      totalHours: parseFloat(row.totalHours) || 0,
      sessionCount: row.sessionCount,
      lastRecorded: row.lastRecorded
    });
  } catch (error) {
    console.error('Fehler bei trainer-hours:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trainer-hours/:year', async (req, res) => {
  const { year } = req.params;
  
  try {
    const [results] = await pool.query(
      `SELECT 
         t.id,
         t.first_name,
         t.last_name,
         ROUND(SUM(ts.hours), 2) as totalHours,
         COUNT(ts.id) as sessionCount,
         MAX(ts.recorded_at) as lastRecorded
       FROM training_sessions ts
       JOIN trainers t ON ts.trainer_id = t.id
       WHERE ts.year = ? AND ts.status = 'recorded'
       GROUP BY t.id, t.first_name, t.last_name
       ORDER BY totalHours DESC`,
      [parseInt(year)]
    );
    
    const hoursMap = {};
    results.forEach(row => {
      hoursMap[row.id] = {
        firstName: row.first_name,
        lastName: row.last_name,
        totalHours: parseFloat(row.totalHours) || 0,
        sessionCount: row.sessionCount,
        lastRecorded: row.lastRecorded
      };
    });
    
    res.json(hoursMap);
  } catch (error) {
    console.error('Fehler bei Stunden-Abfrage:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trainer-hours/:year/:month', async (req, res) => {
  const { year, month } = req.params;
  
  try {
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = parseInt(month) === 12 
      ? `${parseInt(year) + 1}-01-01` 
      : `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
    
    const [results] = await pool.query(
      `SELECT 
         t.id,
         t.first_name,
         t.last_name,
         ROUND(SUM(ts.hours), 2) as totalHours,
         COUNT(ts.id) as sessionCount
       FROM training_sessions ts
       JOIN trainers t ON ts.trainer_id = t.id
       WHERE ts.year = ? 
         AND ts.status = 'recorded'
         AND ts.recorded_at >= ?
         AND ts.recorded_at < ?
       GROUP BY t.id, t.first_name, t.last_name
       ORDER BY totalHours DESC`,
      [parseInt(year), monthStart, nextMonth]
    );
    
    const hoursMap = {};
    results.forEach(row => {
      hoursMap[row.id] = {
        firstName: row.first_name,
        lastName: row.last_name,
        totalHours: parseFloat(row.totalHours) || 0,
        sessionCount: row.sessionCount
      };
    });
    
    res.json(hoursMap);
  } catch (error) {
    console.error('Fehler bei Monats-Abfrage:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/training-sessions/:id', async (req, res) => {
  const { id } = req.params;
  const { hours, reason } = req.body;
  
  if (!hours || hours < 0) {
    return res.status(400).json({ error: 'Ungültige Stunden-Anzahl' });
  }
  
  try {
    const [result] = await pool.query(
      `UPDATE training_sessions 
       SET hours = ?, 
           status = 'corrected', 
           modified_count = modified_count + 1,
           recorded_by = ?
       WHERE id = ?`,
      [parseFloat(hours).toFixed(2), `admin: ${reason || 'Korrektur'}`, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Session nicht gefunden' });
    }
    
    res.json({
      success: true,
      message: 'Stunde korrigiert',
      id,
      newHours: hours
    });
  } catch (error) {
    console.error('Fehler bei Korrektur:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/training-sessions/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const [result] = await pool.query(
      `DELETE FROM training_sessions WHERE id = ?`,
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Session nicht gefunden' });
    }
    
    res.json({
      success: true,
      message: 'Stunde gelöscht',
      id
    });
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    res.status(500).json({ error: error.message });
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
      version: '2.5.0',
      features: [
        'stunden-tracking',
        'addier-subtrahier-logik',
        'duplikat-prevention',
        'cancellation-handling',
        'holiday-weeks',
        'unique-constraint'
      ]
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
    version: '2.5.0',
    features: ['UTF-8', 'Addier/Subtrahier-Logik', 'UNIQUE Constraint', 'Vergangenheits-Check']
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'TSV Rot Trainer API',
    version: '2.5.0',
    status: 'Running',
    endpoints: {
      health: '/api/health',
      trainers: '/api/trainers',
      courses: '/api/courses',
      weeklyAssignments: '/api/weekly-assignments',
      weeklyAssignmentsBatch: '/api/weekly-assignments/batch',
      cancelledCourses: '/api/cancelled-courses',
      holidayWeeks: '/api/holiday-weeks',
      checkWeek: '/api/training-sessions/week/:weekNumber/:year/check',
      trainerHoursYear: '/api/trainer-hours/:year',
      trainerHoursMonth: '/api/trainer-hours/:year/:month',
      trainerHoursIndividual: '/api/trainer-hours/:trainerId/:year'
    },
    cutoffDate: '2025-10-01',
    logic: 'v2.5.0: Addier/Subtrahier-Logik für Stunden (nur Vergangenheit)'
  });
});

// ==================== ERROR HANDLERS ====================

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path, method: req.method });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 TSV Rot Trainer API v2.5.0 running on port ${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
  console.log(`✅ v2.5.0: Addier/Subtrahier-Logik aktiviert`);
  console.log(`✅ Nur Wochen in der Vergangenheit werden erfasst`);
  console.log(`✅ UNIQUE Constraint schützt vor Duplikaten`);
});