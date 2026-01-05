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

// ==================== HILFSFUNKTIONEN v2.5.1 ====================

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

// v2.5.1: Prüfe ob TRAININGSTAG in der Vergangenheit liegt (nicht die ganze Woche!)
const isTrainingDayInPast = (dayOfWeek, weekNumber, year) => {
  // Berechne Startdatum der Woche (Montag)
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayNum = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() - dayNum + 1);
  
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() + (weekNumber - 1) * 7);
  
  // Map Wochentag zu Index (Montag = 0)
  const dayIndexMap = {
    'Monday': 0,
    'Tuesday': 1,
    'Wednesday': 2,
    'Thursday': 3,
    'Friday': 4,
    'Saturday': 5,
    'Sunday': 6
  };
  
  const dayIndex = dayIndexMap[dayOfWeek] || 0;
  
  // Berechne das exakte Datum des Trainingstages
  const trainingDate = new Date(weekStart);
  trainingDate.setUTCDate(weekStart.getUTCDate() + dayIndex);
  trainingDate.setUTCHours(0, 0, 0, 0);
  
  // Prüfe ob der Trainingstag bereits vorbei ist
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // Anfang des heutigen Tages
  
  const isPast = trainingDate < today;
  
  return isPast;
};

// v2.5.1: Berechne Stunden aus Kurs
const calculateCourseHours = (startTime, endTime) => {
  if (!startTime || !endTime) return 1;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  return (endH + endM / 60) - (startH + startM / 60);
};

// ==================== v2.5.1 NEW: SYNC-ENDPOINT ====================

app.post('/api/training-sessions/sync-past-days', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    console.log(`🔄 Starte Sync für vorbei gelaufene Trainingstage...`);
    
    // Hole alle weekly_assignments
    const [allAssignments] = await connection.query(`
      SELECT wa.week_number, wa.year, wa.course_id, wa.trainer_id,
             c.day_of_week, c.start_time, c.end_time
      FROM weekly_assignments wa
      JOIN courses c ON wa.course_id = c.id
      ORDER BY wa.year DESC, wa.week_number DESC
    `);
    
    let synced = 0;
    let skipped = 0;
    
    // Für JEDEN Eintrag prüfen
    for (const assignment of allAssignments) {
      const { week_number, year, course_id, trainer_id, day_of_week, start_time, end_time } = assignment;
      
      // Prüfe: Liegt dieser Trainingstag in der Vergangenheit?
      const dayInPast = isTrainingDayInPast(day_of_week, week_number, year);
      
      if (dayInPast) {
        // Berechne das echte Trainings-Datum für recorded_at
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const dayNum = jan4.getUTCDay() || 7;
        jan4.setUTCDate(jan4.getUTCDate() - dayNum + 1);
        
        const weekStart = new Date(jan4);
        weekStart.setUTCDate(jan4.getUTCDate() + (week_number - 1) * 7);
        
        const dayIndexMap = {
          'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
          'Friday': 4, 'Saturday': 5, 'Sunday': 6
        };
        
        const dayIndex = dayIndexMap[day_of_week] || 0;
        const actualTrainingDate = new Date(weekStart);
        actualTrainingDate.setUTCDate(weekStart.getUTCDate() + dayIndex);
        
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
        
        if (!isCancelled) {
          // Berechne Stunden
          const hours = calculateCourseHours(start_time, end_time);
          
          // DELETE alt, INSERT neu mit echtem Trainings-Datum
          await connection.query(
            'DELETE FROM training_sessions WHERE week_number = ? AND year = ? AND course_id = ? AND trainer_id = ?',
            [week_number, year, course_id, trainer_id]
          );
          
          await connection.query(
            `INSERT INTO training_sessions 
             (week_number, year, course_id, trainer_id, hours, status, recorded_by, recorded_at)
             VALUES (?, ?, ?, ?, ?, 'recorded', 'sync', ?)`,
           [week_number, year, course_id, trainer_id, hours.toFixed(2), actualTrainingDate.toISOString().slice(0, 19).replace('T', ' ')]
          );
          
          synced++;
          console.log(`✅ Sync: Trainer ${trainer_id} Kurs ${course_id} KW ${week_number}/${year} = ${hours.toFixed(2)}h (${actualTrainingDate.toISOString()})`);
        } else {
          // Kurs ist ausgefallen - DELETE
          await connection.query(
            'DELETE FROM training_sessions WHERE week_number = ? AND year = ? AND course_id = ? AND trainer_id = ?',
            [week_number, year, course_id, trainer_id]
          );
          
          console.log(`🚫 Sync: Kurs ${course_id} KW ${week_number}/${year} ausgefallen - gelöscht`);
        }
      } else {
        skipped++;
      }
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Sync abgeschlossen',
      synced: synced,
      skipped: skipped
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('❌ Fehler bei Sync:', error);
    res.status(500).json({ error: 'Sync fehlgeschlagen', details: error.message });
  } finally {
    connection.release();
  }
});

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

// ==================== WEEKLY ASSIGNMENTS v2.5.1 ====================

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
    // Trainer-Zuweisungen laden
    const [assignments] = await pool.query(`
      SELECT wa.id, wa.course_id, wa.week_number, wa.year, wa.trainer_id,
             t.first_name, t.last_name
      FROM weekly_assignments wa
      LEFT JOIN trainers t ON wa.trainer_id = t.id
      WHERE wa.week_number = ? AND wa.year = ?
      ORDER BY wa.course_id, wa.trainer_id
    `, [weekNumber, year]);
    
    // Notizen laden (v2.8.0: ALLE Notizen, nicht nur eine pro Kurs)
    const [notes] = await pool.query(`
      SELECT id, course_id, note_type, note_text
      FROM training_notes
      WHERE week_number = ? AND year = ?
      ORDER BY created_at ASC
    `, [weekNumber, year]);
    
    // Notizen nach course_id gruppieren (Array statt einzelner String)
    const notesMap = {};
    notes.forEach(n => {
      if (!notesMap[n.course_id]) {
        notesMap[n.course_id] = [];
      }
      notesMap[n.course_id].push({
        id: n.id,
        note_type: n.note_type,
        note: n.note_text
      });
    });
    
    // Gruppiere Assignments und füge Notizen hinzu
    const groupedAssignments = assignments.reduce((acc, assignment) => {
      if (!acc[assignment.course_id]) {
        acc[assignment.course_id] = {
          trainers: [],
          notes: notesMap[assignment.course_id] || []
        };
      }
      acc[assignment.course_id].trainers.push({
        id: assignment.id,
        trainerId: assignment.trainer_id,
        firstName: assignment.first_name,
        lastName: assignment.last_name
      });
      return acc;
    }, {});
    
    // Füge Kurse hinzu, die nur Notizen haben aber keine Trainer
    Object.keys(notesMap).forEach(courseId => {
      if (!groupedAssignments[courseId]) {
        groupedAssignments[courseId] = {
          trainers: [],
          notes: notesMap[courseId]
        };
      }
    });
    
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
    
    // Lösche alte und setze neue
    await connection.query(
      'DELETE FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    
    if (trainer_ids && trainer_ids.length > 0) {
      const values = trainer_ids.map((id) => [course_id, week_number, year, id]);
      await connection.query('INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES ?', [values]);
    }
    
    await connection.commit();
    res.status(201).json({ 
      message: 'Weekly assignments updated successfully'
    });
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
    
    // Lösche alle alten Zuweisungen
    await connection.query('DELETE FROM weekly_assignments WHERE week_number = ? AND year = ?', [weekNumber, year]);
    
    // Speichere neue
    for (const [courseId, trainerIds] of Object.entries(updates)) {
      if (trainerIds && trainerIds.length > 0) {
        const values = trainerIds.map(trainerId => [courseId, weekNumber, year, trainerId]);
        await connection.query('INSERT INTO weekly_assignments (course_id, week_number, year, trainer_id) VALUES ?', [values]);
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

// ==================== TRAINING NOTES v2.5.0 ====================

// POST /api/weekly-assignments/note - DEPRECATED in v2.8.0
// Wird für Rückwärtskompatibilität beibehalten, erstellt interne Notizen
app.post('/api/weekly-assignments/note', async (req, res) => {
  try {
    const { course_id, week_number, year, note } = req.body;
    
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ error: 'Missing required fields: course_id, week_number, year' });
    }

    if (note && note.trim()) {
      // v2.8.0: Neue Notiz als 'internal' erstellen
      await pool.query(`
        INSERT INTO training_notes (course_id, week_number, year, note_type, note_text, created_by)
        VALUES (?, ?, ?, 'internal', ?, 'web-app')
      `, [course_id, week_number, year, note.trim()]);
      
      console.log(`📝 Notiz gespeichert: Kurs ${course_id} KW ${week_number}/${year}`);
      res.json({ success: true, message: 'Notiz gespeichert' });
    } else {
      res.json({ success: true, message: 'Keine Notiz zum Speichern' });
    }
  } catch (error) {
    console.error('Error saving note:', error);
    res.status(500).json({ error: 'Fehler beim Speichern der Notiz', details: error.message });
  }
});

// ==================== v2.8.0 NOTES API ====================

// GET /api/notes/week - Alle Notizen für eine Woche (v2.8.0)
app.get('/api/notes/week', async (req, res) => {
  try {
    const { week, year } = req.query;
    
    if (!week || !year) {
      return res.status(400).json({ error: 'week und year sind erforderlich' });
    }
    
    const [notes] = await pool.query(`
      SELECT id, course_id, week_number, year, note_type, note_text as note, created_at, updated_at
      FROM training_notes 
      WHERE week_number = ? AND year = ?
      ORDER BY course_id, created_at ASC
    `, [week, year]);
    
    // Gruppiert nach course_id zurückgeben
    const grouped = notes.reduce((acc, note) => {
      if (!acc[note.course_id]) {
        acc[note.course_id] = [];
      }
      acc[note.course_id].push(note);
      return acc;
    }, {});
    
    res.json({ notes, grouped });
  } catch (error) {
    console.error('Fehler beim Laden der Wochen-Notizen:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Notizen' });
  }
});

// GET /api/notes - Notizen für einen Kurs (v2.8.0)
app.get('/api/notes', async (req, res) => {
  try {
    const { course_id, week, year } = req.query;
    
    if (!course_id || !week || !year) {
      return res.status(400).json({ error: 'course_id, week und year sind erforderlich' });
    }
    
    const [notes] = await pool.query(`
      SELECT id, course_id, week_number, year, note_type, note_text as note, created_at, updated_at
      FROM training_notes 
      WHERE course_id = ? AND week_number = ? AND year = ?
      ORDER BY created_at ASC
    `, [course_id, week, year]);
    
    res.json(notes);
  } catch (error) {
    console.error('Fehler beim Laden der Notizen:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Notizen' });
  }
});

// POST /api/notes - Neue Notiz anlegen (v2.8.0)
app.post('/api/notes', async (req, res) => {
  try {
    const { course_id, week, year, note_type, note } = req.body;
    
    if (!course_id || !week || !year || !note_type || !note) {
      return res.status(400).json({ 
        error: 'Alle Felder sind erforderlich (course_id, week, year, note_type, note)' 
      });
    }
    
    if (!['internal', 'public'].includes(note_type)) {
      return res.status(400).json({ 
        error: 'note_type muss "internal" oder "public" sein' 
      });
    }
    
    const [result] = await pool.query(`
      INSERT INTO training_notes (course_id, week_number, year, note_type, note_text, created_by)
      VALUES (?, ?, ?, ?, ?, 'web-app')
    `, [course_id, week, year, note_type, note.trim()]);
    
    // Neue Notiz zurückgeben
    const [newNote] = await pool.query(
      'SELECT id, course_id, week_number, year, note_type, note_text as note, created_at, updated_at FROM training_notes WHERE id = ?',
      [result.insertId]
    );
    
    console.log(`📝 Neue Notiz erstellt: ID ${result.insertId}, Typ: ${note_type}`);
    res.status(201).json(newNote[0]);
  } catch (error) {
    console.error('Fehler beim Erstellen der Notiz:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen der Notiz' });
  }
});

// PUT /api/notes/:id - Notiz bearbeiten (v2.8.0)
app.put('/api/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { note_type, note } = req.body;
    
    if (!note_type || !note) {
      return res.status(400).json({ error: 'note_type und note sind erforderlich' });
    }
    
    if (!['internal', 'public'].includes(note_type)) {
      return res.status(400).json({ 
        error: 'note_type muss "internal" oder "public" sein' 
      });
    }
    
    const [result] = await pool.query(`
      UPDATE training_notes 
      SET note_type = ?, note_text = ?, updated_at = NOW()
      WHERE id = ?
    `, [note_type, note.trim(), id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notiz nicht gefunden' });
    }
    
    const [updated] = await pool.query(
      'SELECT id, course_id, week_number, year, note_type, note_text as note, created_at, updated_at FROM training_notes WHERE id = ?',
      [id]
    );
    
    console.log(`📝 Notiz aktualisiert: ID ${id}`);
    res.json(updated[0]);
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Notiz:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Notiz' });
  }
});

// DELETE /api/notes/:id - Notiz löschen (v2.8.0)
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.query('DELETE FROM training_notes WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notiz nicht gefunden' });
    }
    
    console.log(`🗑️ Notiz gelöscht: ID ${id}`);
    res.json({ success: true, message: 'Notiz gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen der Notiz:', error);
    res.status(500).json({ error: 'Fehler beim Löschen der Notiz' });
  }
});

// ==================== END v2.8.0 NOTES API ====================
// GET /api/training-notes - Alle Notizen (für Auswertung)
app.get('/api/training-notes', async (req, res) => {
  try {
    const { course_id, week_number, year, from_date, to_date } = req.query;
    
    let query = `
      SELECT tn.*, c.name as course_name, c.day_of_week
      FROM training_notes tn
      JOIN courses c ON tn.course_id = c.id
      WHERE 1=1
    `;
    const params = [];
    
    if (course_id) {
      query += ' AND tn.course_id = ?';
      params.push(course_id);
    }
    if (week_number && year) {
      query += ' AND tn.week_number = ? AND tn.year = ?';
      params.push(week_number, year);
    }
    if (year && !week_number) {
      query += ' AND tn.year = ?';
      params.push(year);
    }
    if (from_date) {
      query += ' AND tn.created_at >= ?';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND tn.created_at <= ?';
      params.push(to_date);
    }
    
    query += ' ORDER BY tn.year DESC, tn.week_number DESC, c.name';
    
    const [notes] = await pool.query(query, params);
    res.json(notes);
  } catch (error) {
    console.error('Error fetching training notes:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Notizen', details: error.message });
  }
});

// GET /api/training-notes/course/:courseId - Notizen für einen Kurs
app.get('/api/training-notes/course/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { year } = req.query;
    
    let query = `
      SELECT tn.*, c.name as course_name
      FROM training_notes tn
      JOIN courses c ON tn.course_id = c.id
      WHERE tn.course_id = ?
    `;
    const params = [courseId];
    
    if (year) {
      query += ' AND tn.year = ?';
      params.push(year);
    }
    
    query += ' ORDER BY tn.year DESC, tn.week_number DESC';
    
    const [notes] = await pool.query(query, params);
    res.json(notes);
  } catch (error) {
    console.error('Error fetching course notes:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Kurs-Notizen', details: error.message });
  }
});

// DELETE /api/training-notes/:id - Einzelne Notiz löschen
app.delete('/api/training-notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.query('DELETE FROM training_notes WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notiz nicht gefunden' });
    }
    
    res.json({ success: true, message: 'Notiz gelöscht' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Fehler beim Löschen der Notiz', details: error.message });
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
  const connection = await pool.getConnection();
  try {
    const { course_id, week_number, year, reason } = req.body;
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    await connection.beginTransaction();
    
    await connection.query(
      'INSERT INTO cancelled_courses (course_id, week_number, year, reason) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason)',
      [course_id, week_number, year, reason || 'Sonstiges']
    );
    
    // v2.5.1: Lösche training_sessions falls in Vergangenheit
    const [courseData] = await connection.query(
      'SELECT day_of_week FROM courses WHERE id = ?',
      [course_id]
    );
    
    if (courseData && courseData.length > 0) {
      const dayInPast = isTrainingDayInPast(courseData[0].day_of_week, week_number, year);
      
      if (dayInPast) {
        await connection.query(
          'DELETE FROM training_sessions WHERE course_id = ? AND week_number = ? AND year = ?',
          [course_id, week_number, year]
        );
      }
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

app.delete('/api/cancelled-courses', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { course_id, week_number, year } = req.query;
    if (!course_id || !week_number || !year) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    await connection.beginTransaction();
    
    await connection.query(
      'DELETE FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
      [course_id, week_number, year]
    );
    
    // v2.5.1: Re-sync falls in Vergangenheit
    const [courseData] = await connection.query(
      'SELECT start_time, end_time, day_of_week FROM courses WHERE id = ?',
      [course_id]
    );
    
    if (courseData && courseData.length > 0) {
      const dayInPast = isTrainingDayInPast(courseData[0].day_of_week, week_number, year);
      
      if (dayInPast) {
        // Hole Trainer-Zuweisungen und re-sync
        const [assignments] = await connection.query(
          'SELECT trainer_id FROM weekly_assignments WHERE course_id = ? AND week_number = ? AND year = ?',
          [course_id, week_number, year]
        );
        
        const [holidayCheck] = await connection.query(
          'SELECT id FROM holiday_weeks WHERE week_number = ? AND year = ?',
          [week_number, year]
        );
        
        if (holidayCheck.length === 0) {
          const hours = calculateCourseHours(courseData[0].start_time, courseData[0].end_time);
          
          for (const assignment of assignments) {
            await connection.query(
              `DELETE FROM training_sessions WHERE course_id = ? AND week_number = ? AND year = ? AND trainer_id = ?`,
              [course_id, week_number, year, assignment.trainer_id]
            );
            
            await connection.query(
              `INSERT INTO training_sessions 
               (week_number, year, course_id, trainer_id, hours, status, recorded_by)
               VALUES (?, ?, ?, ?, ?, 'recorded', 'sync')`,
              [week_number, year, course_id, assignment.trainer_id, hours.toFixed(2)]
            );
          }
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
  const connection = await pool.getConnection();
  try {
    const { week_number, year } = req.body;
    if (!week_number || !year) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    await connection.beginTransaction();
    
    await connection.query('INSERT IGNORE INTO holiday_weeks (week_number, year) VALUES (?, ?)', [week_number, year]);
    
    // v2.5.1: Lösche training_sessions für diese Woche falls in Vergangenheit
    const [courseAssignments] = await connection.query(
      `SELECT DISTINCT wa.course_id, c.day_of_week
       FROM weekly_assignments wa
       JOIN courses c ON wa.course_id = c.id
       WHERE wa.week_number = ? AND wa.year = ?`,
      [week_number, year]
    );
    
    for (const assignment of courseAssignments) {
      const dayInPast = isTrainingDayInPast(assignment.day_of_week, week_number, year);
      
      if (dayInPast) {
        await connection.query(
          'DELETE FROM training_sessions WHERE week_number = ? AND year = ? AND course_id = ?',
          [week_number, year, assignment.course_id]
        );
      }
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

app.delete('/api/holiday-weeks', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { week_number, year } = req.query;
    if (!week_number || !year) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    await connection.beginTransaction();
    
    await connection.query('DELETE FROM holiday_weeks WHERE week_number = ? AND year = ?', [week_number, year]);
    
    // v2.5.1: Re-sync falls in Vergangenheit
    const [assignments] = await connection.query(
      `SELECT DISTINCT wa.course_id, wa.trainer_id, c.start_time, c.end_time, c.day_of_week
       FROM weekly_assignments wa
       JOIN courses c ON wa.course_id = c.id
       WHERE wa.week_number = ? AND wa.year = ?`,
      [week_number, year]
    );
    
    for (const assignment of assignments) {
      const dayInPast = isTrainingDayInPast(assignment.day_of_week, week_number, year);
      
      if (dayInPast) {
        const [cancelledCheck] = await connection.query(
          'SELECT id FROM cancelled_courses WHERE course_id = ? AND week_number = ? AND year = ?',
          [assignment.course_id, week_number, year]
        );
        
        if (cancelledCheck.length === 0) {
          const hours = calculateCourseHours(assignment.start_time, assignment.end_time);
          
          await connection.query(
            `DELETE FROM training_sessions WHERE course_id = ? AND week_number = ? AND year = ? AND trainer_id = ?`,
            [assignment.course_id, week_number, year, assignment.trainer_id]
          );
          
          await connection.query(
            `INSERT INTO training_sessions 
             (week_number, year, course_id, trainer_id, hours, status, recorded_by)
             VALUES (?, ?, ?, ?, ?, 'recorded', 'sync')`,
            [week_number, year, assignment.course_id, assignment.trainer_id, hours.toFixed(2)]
          );
        }
      }
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
       WHERE ts.year = ? 
         AND ts.status = 'recorded'
         AND DATE(ts.recorded_at) <= CURDATE()
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
    
    console.log(`🔍 Monatsstunden Query: year=${year}, month=${month}, range=${monthStart} to ${nextMonth}`);
    
    const [results] = await pool.query(
      `SELECT 
         ts.trainer_id as id,
         ROUND(SUM(ts.hours), 2) as totalHours,
         COUNT(ts.id) as sessionCount
       FROM training_sessions ts
       WHERE ts.year = ? 
         AND ts.status = 'recorded'
         AND ts.recorded_at >= ?
         AND ts.recorded_at < ?
         AND DATE(ts.recorded_at) <= CURDATE()
       GROUP BY ts.trainer_id
       ORDER BY totalHours DESC`,
      [parseInt(year), monthStart, nextMonth]
    );
    
    console.log(`📊 Monatsstunden Ergebnisse: ${results.length} Trainer`, results);
    
    const hoursMap = {};
    results.forEach(row => {
      hoursMap[row.id] = {
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

// ==================== SPECIAL ACTIVITIES (AUSSERPLANMÄSSIGE AKTIVITÄTEN) ====================

// GET /api/special-activities - Alle außerplanmäßigen Aktivitäten laden
app.get('/api/special-activities', async (req, res) => {
  try {
    const [activities] = await pool.execute(`
      SELECT 
        ts.id,
        ts.week_number,
        ts.year,
        ts.trainer_id,
        ts.hours,
        ts.activity_type,
        ts.custom_type,
        ts.notes as title,
        ts.recorded_at as date,
        ts.day_of_week,
        ts.notes,
        ts.status,
        ts.visibility
      FROM training_sessions ts
      WHERE ts.course_id IS NULL 
        AND ts.activity_type IS NOT NULL
      ORDER BY ts.recorded_at DESC
    `);
    
    res.json(activities);
  } catch (error) {
    console.error('Error loading special activities:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Aktivitäten' });
  }
});

// GET /api/special-activities/week/:weekNumber/:year - Aktivitäten einer Woche
app.get('/api/special-activities/week/:weekNumber/:year', async (req, res) => {
  const { weekNumber, year } = req.params;
  
  try {
    const [activities] = await pool.execute(`
      SELECT 
        ts.id,
        ts.week_number,
        ts.year,
        ts.trainer_id,
        ts.hours,
        ts.activity_type,
        ts.custom_type,
        ts.notes as title,
        ts.recorded_at as date,
        ts.day_of_week,
        ts.status
      FROM training_sessions ts
      WHERE ts.week_number = ?
        AND ts.year = ?
        AND ts.course_id IS NULL 
        AND ts.activity_type IS NOT NULL
      ORDER BY ts.recorded_at ASC, ts.id ASC
    `, [parseInt(weekNumber), parseInt(year)]);
    
    res.json(activities);
  } catch (error) {
    console.error('Error loading week activities:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Wochen-Aktivitäten' });
  }
});

// POST /api/special-activities - Neue außerplanmäßige Aktivität erstellen
app.post('/api/special-activities', async (req, res) => {
  const { 
    date, 
    weekNumber, 
    year, 
    activityType, 
    customType, 
    title, 
    hours, 
    notes, 
    trainerIds,
    visibility = 'internal'
  } = req.body;
  
  // Validierung
  if (!date || !weekNumber || !year || !activityType || !title || !hours || !trainerIds || trainerIds.length === 0) {
    return res.status(400).json({ error: 'Fehlende Pflichtfelder' });
  }
  
  // v2.6.6: Berechne day_of_week aus Datum
  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const dayOfWeek = dayNames[new Date(date).getDay()];
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Für jeden Trainer einen separaten Eintrag erstellen
    for (const trainerId of trainerIds) {
      await connection.execute(`
        INSERT INTO training_sessions 
        (week_number, year, course_id, trainer_id, hours, status, activity_type, custom_type, notes, recorded_at, day_of_week, recorded_by, visibility)
        VALUES (?, ?, NULL, ?, ?, 'recorded', ?, ?, ?, ?, ?, 'activity-form', ?)
      `, [
        weekNumber,
        year,
        trainerId,
        hours,
        activityType,
        activityType === 'sonstiges' ? customType : null,
        title,
        date,
        dayOfWeek,
        visibility
      ]);
    }
    
    await connection.commit();
    
    res.json({ 
      success: true, 
      message: `Aktivität erfolgreich für ${trainerIds.length} Trainer gespeichert` 
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creating special activity:', error);
    res.status(500).json({ error: 'Fehler beim Speichern der Aktivität' });
  } finally {
    connection.release();
  }
});

// PUT /api/special-activities/:activityId - Aktivität aktualisieren
app.put('/api/special-activities/:activityId', async (req, res) => {
  const { activityId } = req.params;
  const { 
    date, 
    weekNumber, 
    year, 
    activityType, 
    customType, 
    title, 
    hours, 
    notes, 
    trainerIds,
    visibility
  } = req.body;
  
  // Validierung
  if (!date || !weekNumber || !year || !activityType || !title || !hours || !trainerIds || trainerIds.length === 0) {
    return res.status(400).json({ error: 'Fehlende Pflichtfelder' });
  }
  
  // v2.6.6: Berechne day_of_week aus Datum
  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const dayOfWeek = dayNames[new Date(date).getDay()];
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 1. Finde die alte Aktivität (date + title)
    const [oldActivity] = await connection.execute(`
      SELECT recorded_at, notes
      FROM training_sessions 
      WHERE id = ? AND course_id IS NULL AND activity_type IS NOT NULL
    `, [activityId]);
    
    if (oldActivity.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Aktivität nicht gefunden' });
    }
    
    const { recorded_at: oldDate, notes: oldTitle } = oldActivity[0];
    
    // 2. Lösche ALLE alten Einträge (alle Trainer der alten Aktivität)
    await connection.execute(`
      DELETE FROM training_sessions 
      WHERE course_id IS NULL 
        AND activity_type IS NOT NULL
        AND recorded_at = ?
        AND notes = ?
    `, [oldDate, oldTitle]);
    
    // 3. Erstelle neue Einträge für alle ausgewählten Trainer
    for (const trainerId of trainerIds) {
      await connection.execute(`
        INSERT INTO training_sessions 
        (week_number, year, course_id, trainer_id, hours, status, activity_type, custom_type, notes, recorded_at, day_of_week, recorded_by, visibility)
        VALUES (?, ?, NULL, ?, ?, 'recorded', ?, ?, ?, ?, ?, 'activity-form', ?)
      `, [
        weekNumber,
        year,
        trainerId,
        hours,
        activityType,
        activityType === 'sonstiges' ? customType : null,
        title,
        date,
        dayOfWeek,
        visibility
      ]);
    }
    
    await connection.commit();
    
    res.json({ 
      success: true, 
      message: `Aktivität erfolgreich aktualisiert für ${trainerIds.length} Trainer` 
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error updating special activity:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Aktivität' });
  } finally {
    connection.release();
  }
});

// DELETE /api/special-activities/:activityId - Aktivität löschen
app.delete('/api/special-activities/:activityId', async (req, res) => {
  const { activityId } = req.params;
  
  try {
    // Finde die Aktivität und alle zugehörigen Einträge (gleiche date + title)
    const [activity] = await pool.execute(`
      SELECT recorded_at, notes
      FROM training_sessions 
      WHERE id = ? AND course_id IS NULL AND activity_type IS NOT NULL
    `, [activityId]);
    
    if (activity.length === 0) {
      return res.status(404).json({ error: 'Aktivität nicht gefunden' });
    }
    
    const { recorded_at, notes } = activity[0];
    
    // Lösche ALLE Einträge dieser Aktivität (alle Trainer)
    await pool.execute(`
      DELETE FROM training_sessions 
      WHERE course_id IS NULL 
        AND activity_type IS NOT NULL
        AND recorded_at = ?
        AND notes = ?
    `, [recorded_at, notes]);
    
    res.json({ success: true, message: 'Aktivität gelöscht' });
    
  } catch (error) {
    console.error('Error deleting special activity:', error);
    res.status(500).json({ error: 'Fehler beim Löschen der Aktivität' });
  }
});

// GET /api/weekly-activities/:year/:week - Aktivitäten einer Woche für WeeklyView
app.get('/api/weekly-activities/:year/:week', async (req, res) => {
  const { year, week } = req.params;
  
  console.log(`📅 Weekly Activities Request: KW ${week}/${year}`);
  
  try {
    // Gruppiere Activities und fasse Trainer zusammen
    const [activities] = await pool.execute(`
      SELECT 
        MIN(ts.id) as id,
        ts.week_number,
        ts.year,
        ts.recorded_at as date,
        ts.day_of_week,
        ts.activity_type,
        ts.custom_type,
        ts.notes as title,
        ts.hours,
        ts.visibility,
        ts.status,
        GROUP_CONCAT(DISTINCT CONCAT(t.first_name, ' ', t.last_name) ORDER BY t.last_name SEPARATOR ', ') as trainer_names,
        COUNT(DISTINCT ts.trainer_id) as trainer_count
      FROM training_sessions ts
      LEFT JOIN trainers t ON ts.trainer_id = t.id
      WHERE ts.week_number = ?
        AND ts.year = ?
        AND ts.course_id IS NULL 
        AND ts.activity_type IS NOT NULL
      GROUP BY 
        ts.recorded_at,
        ts.day_of_week,
        ts.activity_type,
        ts.custom_type,
        ts.notes,
        ts.hours,
        ts.visibility,
        ts.status,
        ts.week_number,
        ts.year
      ORDER BY ts.recorded_at ASC
    `, [parseInt(week), parseInt(year)]);
    
    console.log(`✅ Found ${activities.length} activities for KW ${week}/${year}`);
    
    res.json(activities);
  } catch (error) {
    console.error('Error loading weekly activities:', error);
    res.status(500).json({ error: 'Failed to fetch weekly activities', details: error.message });
  }
});

// ==================== COURSE EXCEPTIONS (Ferien-Override) ====================

// GET /api/course-exceptions - Kurs-Ausnahmen für Ferienwochen laden
app.get('/api/course-exceptions', async (req, res) => {
  const { weekNumber, year } = req.query;
  
  try {
    // Prüfe ob Tabelle existiert
    const [tables] = await pool.execute(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'course_exceptions'
    `);
    
    if (tables.length === 0) {
      // Tabelle existiert nicht - erstelle sie
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS course_exceptions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          course_id INT NOT NULL,
          week_number INT NOT NULL,
          year INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_exception (course_id, week_number, year),
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )
      `);
      console.log('✅ course_exceptions Tabelle erstellt');
      return res.json([]);
    }
    
    const [exceptions] = await pool.execute(`
      SELECT course_id, week_number, year
      FROM course_exceptions
      WHERE week_number = ? AND year = ?
    `, [parseInt(weekNumber), parseInt(year)]);
    
    res.json(exceptions);
  } catch (error) {
    console.error('Error loading course exceptions:', error);
    res.json([]); // Bei Fehler leeres Array statt 500
  }
});

// POST /api/course-exceptions - Kurs-Ausnahme hinzufügen (Kurs findet trotz Ferien statt)
app.post('/api/course-exceptions', async (req, res) => {
  const { course_id, week_number, year } = req.body;
  
  try {
    // Erstelle Tabelle falls nicht vorhanden
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS course_exceptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        course_id INT NOT NULL,
        week_number INT NOT NULL,
        year INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_exception (course_id, week_number, year),
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
      )
    `);
    
    await pool.execute(`
      INSERT INTO course_exceptions (course_id, week_number, year)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE id = id
    `, [course_id, week_number, year]);
    
    console.log(`✅ Course Exception: Kurs ${course_id} findet in KW ${week_number}/${year} statt`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding course exception:', error);
    res.status(500).json({ error: 'Fehler beim Hinzufügen der Ausnahme' });
  }
});

// DELETE /api/course-exceptions - Kurs-Ausnahme entfernen
app.delete('/api/course-exceptions', async (req, res) => {
  const { course_id, week_number, year } = req.query;
  
  try {
    await pool.execute(`
      DELETE FROM course_exceptions
      WHERE course_id = ? AND week_number = ? AND year = ?
    `, [parseInt(course_id), parseInt(week_number), parseInt(year)]);
    
    console.log(`🗑️ Course Exception entfernt: Kurs ${course_id} in KW ${week_number}/${year}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing course exception:', error);
    res.status(500).json({ error: 'Fehler beim Entfernen der Ausnahme' });
  }
});

// ==================== ENDE SPECIAL ACTIVITIES ====================

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

// ÖFFENTLICHER KURSPLAN - Eltern/Teilnehmer Ansicht

// GET /api/public/kursplan - Öffentlicher Wochenplan (KEIN LOGIN!)
app.get('/api/public/kursplan', async (req, res) => {
  try {
    const weekNumber = parseInt(req.query.week) || getISOWeekNumber(new Date());
    const year = parseInt(req.query.year) || new Date().getFullYear();

    console.log(`📅 Öffentlicher Kursplan abgerufen: KW ${weekNumber}/${year}`);

    // 1. Prüfen ob Ferienwoche
    const [holidayRows] = await pool.query(
      'SELECT * FROM holiday_weeks WHERE week_number = ? AND year = ?',
      [weekNumber, year]
    );
    const isHolidayWeek = holidayRows.length > 0;
    const holidayName = isHolidayWeek ? (holidayRows[0].name || 'Ferien') : null;

    // 2. Alle aktiven Kurse laden
    const [courses] = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.day_of_week,
        c.start_time,
        c.end_time,
        c.location,
        c.category
      FROM courses c
      WHERE c.is_active = 1
      ORDER BY 
        FIELD(c.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
        c.start_time
    `);

    // 3. Ausgefallene Kurse für diese Woche
    const [cancelledCourses] = await pool.query(
      'SELECT course_id, reason FROM cancelled_courses WHERE week_number = ? AND year = ?',
      [weekNumber, year]
    );
    const cancelledMap = new Map(cancelledCourses.map(c => [c.course_id, c.reason]));

    // v2.8.0: Öffentliche Notizen laden
    const [publicNotes] = await pool.query(`
      SELECT course_id, note_text
      FROM training_notes
      WHERE week_number = ? AND year = ? AND note_type = 'public'
      ORDER BY created_at ASC
    `, [weekNumber, year]);
    
    // Notizen nach course_id gruppieren
    const publicNotesMap = {};
    publicNotes.forEach(n => {
      if (!publicNotesMap[n.course_id]) {
        publicNotesMap[n.course_id] = [];
      }
      publicNotesMap[n.course_id].push(n.note_text);
    });

    // 4. Trainer-Zuweisungen für diese Woche laden
    const [assignments] = await pool.query(`
      SELECT 
        wa.course_id,
        t.id as trainer_id,
        t.first_name,
        t.last_name
      FROM weekly_assignments wa
      JOIN trainers t ON wa.trainer_id = t.id
      WHERE wa.week_number = ? AND wa.year = ?
    `, [weekNumber, year]);

    // Assignments nach Kurs gruppieren
    const assignmentMap = new Map();
    assignments.forEach(a => {
      if (!assignmentMap.has(a.course_id)) {
        assignmentMap.set(a.course_id, []);
      }
      assignmentMap.get(a.course_id).push({
        firstName: a.first_name,
        lastName: a.last_name
      });
    });

    // 5. Falls keine Zuweisungen für einen Kurs: Default-Trainer laden
    const coursesWithoutAssignments = courses
      .filter(c => !assignmentMap.has(c.id))
      .map(c => c.id);

    if (coursesWithoutAssignments.length > 0) {
      const placeholders = coursesWithoutAssignments.map(() => '?').join(',');
      const [defaults] = await pool.query(`
        SELECT 
          ct.course_id,
          t.first_name,
          t.last_name
        FROM course_trainers ct
        JOIN trainers t ON ct.trainer_id = t.id
        WHERE ct.course_id IN (${placeholders})
      `, coursesWithoutAssignments);

      defaults.forEach(d => {
        if (!assignmentMap.has(d.course_id)) {
          assignmentMap.set(d.course_id, []);
        }
        assignmentMap.get(d.course_id).push({
          firstName: d.first_name,
          lastName: d.last_name
        });
      });
    }

    // 6. Wochentag-Konvertierung (English -> German)
    const dayMapToGerman = {
      'Monday': 'Montag',
      'Tuesday': 'Dienstag',
      'Wednesday': 'Mittwoch',
      'Thursday': 'Donnerstag',
      'Friday': 'Freitag',
      'Saturday': 'Samstag',
      'Sunday': 'Sonntag'
    };

    // 7. Response zusammenbauen
    const schedule = courses.map(course => {
      const isCancelled = cancelledMap.has(course.id);
      const cancelReason = cancelledMap.get(course.id) || null;
      
      // Kurs fällt aus wenn: explizit gecancelled ODER Ferienwoche
      const isOff = isCancelled || isHolidayWeek;
      
      let status = 'findet statt';
      let statusReason = null;
      
      if (isCancelled) {
        status = 'fällt aus';
        statusReason = cancelReason || 'Ausfall';
      } else if (isHolidayWeek) {
        status = 'fällt aus';
        statusReason = holidayName;
      }

      const trainers = assignmentMap.get(course.id) || [];
      const germanDay = dayMapToGerman[course.day_of_week] || course.day_of_week;

      return {
        id: course.id,
        name: course.name,
        dayOfWeek: germanDay,
        startTime: course.start_time?.slice(0, 5),
        endTime: course.end_time?.slice(0, 5),
        location: course.location || '',
        category: course.category || '',
        trainers: trainers.map(t => `${t.firstName} ${t.lastName}`),
        status: status,
        statusReason: statusReason,
        isOff: isOff,
        public_notes: publicNotesMap[course.id] || []
      };
    });

    // 8. Nach Wochentag gruppieren
    const scheduleByDay = {
      Montag: [],
      Dienstag: [],
      Mittwoch: [],
      Donnerstag: [],
      Freitag: [],
      Samstag: [],
      Sonntag: []
    };

    schedule.forEach(course => {
      if (scheduleByDay[course.dayOfWeek]) {
        scheduleByDay[course.dayOfWeek].push(course);
      }
    });

    // 9. Wochendaten berechnen (für Anzeige "Mo 02.12. - So 08.12.")
    const weekDates = getWeekDates(weekNumber, year);

    // 10. Öffentliche Sonderaktivitäten laden (v2.12.0)
    const [publicActivities] = await pool.execute(`
      SELECT 
        ts.id,
        ts.recorded_at as date,
        ts.activity_type,
        ts.custom_type,
        ts.notes as title,
        ts.hours,
        ts.day_of_week,
        ts.visibility,
        GROUP_CONCAT(DISTINCT CONCAT(t.first_name, ' ', t.last_name) ORDER BY t.last_name SEPARATOR ', ') as trainer_names
      FROM training_sessions ts
      LEFT JOIN trainers t ON ts.trainer_id = t.id
      WHERE ts.week_number = ?
        AND ts.year = ?
        AND ts.course_id IS NULL 
        AND ts.activity_type IS NOT NULL
        AND ts.visibility = 'public'
      GROUP BY ts.recorded_at, ts.notes, ts.activity_type, ts.hours, ts.day_of_week
      ORDER BY ts.recorded_at ASC
    `, [weekNumber, year]);

    res.json({
      success: true,
      weekNumber,
      year,
      isHolidayWeek,
      holidayName,
      weekDates,
      schedule: scheduleByDay,
      activities: publicActivities,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching public schedule:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Fehler beim Laden des Kursplans' 
    });
  }
});

// Hilfsfunktion: ISO Kalenderwoche berechnen
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Hilfsfunktion: Start- und Enddatum einer Woche berechnen
function getWeekDates(weekNumber, year) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayNum = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() - dayNum + 1); // Montag der KW1
  
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() + (weekNumber - 1) * 7);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  
  const formatDate = (d) => {
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${day}.${month}.`;
  };
  
  return {
    start: formatDate(weekStart),
    end: formatDate(weekEnd),
    startFull: weekStart.toISOString().slice(0, 10),
    endFull: weekEnd.toISOString().slice(0, 10)
  };
}

// ==================== UTILITY ====================

app.get('/api/health', async (req, res) => {
  try {
    const [[dbCheck]] = await pool.query('SELECT 1 as healthy');
    res.json({ 
      status: 'OK', 
      database: 'Connected',
      timestamp: new Date().toISOString(),
      version: '2.9.0',
      features: [
        'stunden-tracking',
        'tagesgenau',
        'sync-on-load',
        'alle-trainer-gezählt',
        'duplikat-prevention',
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
    version: '2.5.1',
    features: ['UTF-8', 'Tagesgenau', 'Sync-on-Load', 'Alle Trainer gezählt']
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'TSV Rot Trainer API',
    version: '2.5.1',
    status: 'Running',
    endpoints: {
      health: '/api/health',
      syncPastDays: 'POST /api/training-sessions/sync-past-days',
      trainers: '/api/trainers',
      courses: '/api/courses',
      weeklyAssignments: '/api/weekly-assignments',
      cancelledCourses: '/api/cancelled-courses',
      holidayWeeks: '/api/holiday-weeks',
      trainerHoursYear: '/api/trainer-hours/:year',
      reportsTrainerHours: 'GET /api/reports/trainer-hours?year=YYYY',
      reportsHallUsage: 'GET /api/reports/hall-usage?year=YYYY'
    },
    newInV290: 'Reports: Jahresberichte für Trainer-Stunden und Hallen-Auslastung'
  });
});

// ==================== REPORTS ENDPOINTS ====================

// Alle Trainer-Stunden für ein Jahr
app.get('/api/reports/trainer-hours', async (req, res) => {
  const { year } = req.query;
  
  if (!year) {
    return res.status(400).json({ error: 'Jahr-Parameter fehlt' });
  }
  
  try {
    const [results] = await pool.query(
      `SELECT 
         t.id,
         t.first_name,
         t.last_name,
         ROUND(SUM(ts.hours), 1) as total_hours,
         COUNT(DISTINCT CONCAT(ts.week_number, '-', ts.year)) as training_weeks,
         COUNT(ts.id) as session_count
       FROM training_sessions ts
       JOIN trainers t ON ts.trainer_id = t.id
       WHERE ts.year = ? AND ts.status = 'recorded'
       GROUP BY t.id, t.first_name, t.last_name
       ORDER BY t.last_name, t.first_name`,
      [parseInt(year)]
    );
    
    const formattedResults = results.map(row => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      firstName: row.first_name,
      lastName: row.last_name,
      totalHours: parseFloat(row.total_hours) || 0,
      trainingWeeks: row.training_weeks || 0,
      sessionCount: row.session_count || 0
    }));
    
    const totalSum = formattedResults.reduce((sum, t) => sum + t.totalHours, 0);
    
    res.json({
      success: true,
      year: parseInt(year),
      trainers: formattedResults,
      summary: {
        totalHours: Math.round(totalSum * 10) / 10,
        trainerCount: formattedResults.length
      }
    });
    
  } catch (error) {
    console.error('Fehler bei Trainer-Jahresstunden:', error);
    res.status(500).json({ error: error.message });
  }
});

// Hallen-Auslastung für ein Jahr
app.get('/api/reports/hall-usage', async (req, res) => {
  const { year } = req.query;
  
  if (!year) {
    return res.status(400).json({ error: 'Jahr-Parameter fehlt' });
  }
  
  try {
    const [results] = await pool.query(
      `SELECT 
         c.location,
         ROUND(SUM(ts.hours), 1) as total_hours,
         COUNT(DISTINCT c.id) as course_count,
         COUNT(DISTINCT CONCAT(ts.week_number, '-', ts.year)) as training_weeks,
         COUNT(ts.id) as session_count
       FROM training_sessions ts
       JOIN courses c ON ts.course_id = c.id
       WHERE ts.year = ? 
         AND ts.status = 'recorded'
         AND c.location IS NOT NULL
         AND c.location != ''
       GROUP BY c.location
       ORDER BY total_hours DESC`,
      [parseInt(year)]
    );
    
    const formattedResults = results.map(row => ({
      location: row.location,
      totalHours: parseFloat(row.total_hours) || 0,
      courseCount: row.course_count || 0,
      trainingWeeks: row.training_weeks || 0,
      sessionCount: row.session_count || 0
    }));
    
    const totalSum = formattedResults.reduce((sum, h) => sum + h.totalHours, 0);
    
    res.json({
      success: true,
      year: parseInt(year),
      halls: formattedResults,
      summary: {
        totalHours: Math.round(totalSum * 10) / 10,
        hallCount: formattedResults.length
      }
    });
    
  } catch (error) {
    console.error('Fehler bei Hallen-Auslastung:', error);
    res.status(500).json({ error: error.message });
  }
});

// Trainer-Stunden für einen Zeitraum (von-bis)
app.get('/api/reports/trainer-hours-range', async (req, res) => {
  const { start, end } = req.query;
  
  if (!start || !end) {
    return res.status(400).json({ error: 'Start- und End-Datum erforderlich' });
  }
  
  try {
    // Berechne Start- und End-KW aus Datumsangaben
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // ISO Week berechnen
    const getISOWeek = (date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
    };
    
    const startWeek = getISOWeek(startDate);
    const endWeek = getISOWeek(endDate);
    
    const [results] = await pool.query(
      `SELECT 
         t.id,
         t.first_name,
         t.last_name,
         ROUND(SUM(ts.hours), 1) as total_hours,
         COUNT(DISTINCT CONCAT(ts.week_number, '-', ts.year)) as training_weeks,
         COUNT(ts.id) as session_count
       FROM training_sessions ts
       JOIN trainers t ON ts.trainer_id = t.id
       WHERE ((ts.year = ? AND ts.week_number >= ?) OR ts.year > ?)
         AND ((ts.year = ? AND ts.week_number <= ?) OR ts.year < ?)
         AND ts.status = 'recorded'
       GROUP BY t.id, t.first_name, t.last_name
       ORDER BY t.last_name, t.first_name`,
      [startWeek.year, startWeek.week, startWeek.year, 
       endWeek.year, endWeek.week, endWeek.year]
    );
    
    const formattedResults = results.map(row => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      firstName: row.first_name,
      lastName: row.last_name,
      totalHours: parseFloat(row.total_hours) || 0,
      trainingWeeks: row.training_weeks || 0,
      sessionCount: row.session_count || 0
    }));
    
    const totalSum = formattedResults.reduce((sum, t) => sum + t.totalHours, 0);
    
    res.json({
      success: true,
      startDate: start,
      endDate: end,
      trainers: formattedResults,
      summary: {
        totalHours: Math.round(totalSum * 10) / 10,
        trainerCount: formattedResults.length
      }
    });
    
  } catch (error) {
    console.error('Fehler bei Trainer-Zeitraum:', error);
    res.status(500).json({ error: error.message });
  }
});

// Hallen-Auslastung für einen Zeitraum (von-bis)
app.get('/api/reports/hall-usage-range', async (req, res) => {
  const { start, end } = req.query;
  
  if (!start || !end) {
    return res.status(400).json({ error: 'Start- und End-Datum erforderlich' });
  }
  
  try {
    // Berechne Start- und End-KW aus Datumsangaben
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // ISO Week berechnen
    const getISOWeek = (date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
    };
    
    const startWeek = getISOWeek(startDate);
    const endWeek = getISOWeek(endDate);
    
    // Query mit Wochen-Filter
    const [results] = await pool.query(
      `SELECT 
         c.location,
         ROUND(SUM(ts.hours), 1) as total_hours,
         COUNT(DISTINCT c.id) as course_count,
         COUNT(DISTINCT CONCAT(ts.week_number, '-', ts.year)) as training_weeks,
         COUNT(ts.id) as session_count
       FROM training_sessions ts
       JOIN courses c ON ts.course_id = c.id
       WHERE ((ts.year = ? AND ts.week_number >= ?) OR ts.year > ?)
         AND ((ts.year = ? AND ts.week_number <= ?) OR ts.year < ?)
         AND ts.status = 'recorded'
         AND c.location IS NOT NULL
         AND c.location != ''
       GROUP BY c.location
       ORDER BY total_hours DESC`,
      [startWeek.year, startWeek.week, startWeek.year, 
       endWeek.year, endWeek.week, endWeek.year]
    );
    
    const formattedResults = results.map(row => ({
      location: row.location,
      totalHours: parseFloat(row.total_hours) || 0,
      courseCount: row.course_count || 0,
      trainingWeeks: row.training_weeks || 0,
      sessionCount: row.session_count || 0
    }));
    
    const totalSum = formattedResults.reduce((sum, h) => sum + h.totalHours, 0);
    
    res.json({
      success: true,
      startDate: start,
      endDate: end,
      halls: formattedResults,
      summary: {
        totalHours: Math.round(totalSum * 10) / 10,
        hallCount: formattedResults.length
      }
    });
    
  } catch (error) {
    console.error('Fehler bei Hallen-Zeitraum:', error);
    res.status(500).json({ error: error.message });
  }
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
  console.log(`🚀 TSV Rot Trainer API v2.10.1 running on port ${PORT}`);
  console.log(`✅ FIX in v2.10.1: Zeitraum-Analyse verwendet jetzt week_number statt recorded_at`);
  console.log(`   - GET /api/reports/trainer-hours-range?start=YYYY-MM-DD&end=YYYY-MM-DD`);
  console.log(`   - GET /api/reports/hall-usage-range?start=YYYY-MM-DD&end=YYYY-MM-DD`);
  console.log(`   - Trainer alphabetisch sortiert`);
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