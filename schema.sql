CREATE TABLE IF NOT EXISTS weekly_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  week_number INT NOT NULL,
  year INT NOT NULL,
  trainer_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_assignment (course_id, week_number, year, trainer_id),
  INDEX idx_week (course_id, week_number, year)
);

CREATE TABLE IF NOT EXISTS cancelled_courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  week_number INT NOT NULL,
  year INT NOT NULL,
  reason VARCHAR(255) DEFAULT 'Sonstiges',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_cancellation (course_id, week_number, year)
);

CREATE TABLE IF NOT EXISTS holiday_weeks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  week_number INT NOT NULL,
  year INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_holiday (week_number, year)
);
