-- ============================================================
-- MAIA: Missing Person Alert & Intelligence System
-- Database Schema for Davao City Police Office
-- ============================================================

CREATE DATABASE IF NOT EXISTS maia_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE maia_db;

-- ── Users (reporters, admins, community members) ──────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(150) NOT NULL,
  phone         VARCHAR(20)  NOT NULL UNIQUE,
  email         VARCHAR(150) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('reporter','admin','superadmin') DEFAULT 'reporter',
  id_type       VARCHAR(50),
  id_photo_path VARCHAR(255),
  is_verified   BOOLEAN DEFAULT FALSE,
  otp_code      VARCHAR(6),
  otp_expires   DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Missing person reports ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS missing_persons (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  reference_no     VARCHAR(20) NOT NULL UNIQUE,   -- e.g. MAIA-2026-0001
  reporter_id      INT NOT NULL,
  full_name        VARCHAR(150) NOT NULL,
  age              TINYINT UNSIGNED NOT NULL,
  gender           ENUM('male','female','other') NOT NULL,
  photo_path       VARCHAR(255),
  last_seen_place  VARCHAR(200) NOT NULL,
  last_seen_lat    DECIMAL(10,7),
  last_seen_lng    DECIMAL(10,7),
  last_seen_date   DATE NOT NULL,
  last_seen_time   TIME,
  description      TEXT,
  status           ENUM('pending','verified','active','found','closed','rejected') DEFAULT 'pending',
  ai_fake_score    DECIMAL(5,2) DEFAULT 0,        -- 0-100 probability of fake
  ai_duplicate_id  INT DEFAULT NULL,              -- points to duplicate case if found
  verified_by      INT DEFAULT NULL,
  verified_at      DATETIME,
  fb_post_id       VARCHAR(100),                  -- Facebook post ID after dissemination
  fb_posted_at     DATETIME,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id)  REFERENCES users(id),
  FOREIGN KEY (verified_by)  REFERENCES users(id)
);

-- ── Sightings submitted by community ─────────────────────────
CREATE TABLE IF NOT EXISTS sightings (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  missing_person_id INT NOT NULL,
  reporter_id      INT,
  reporter_name    VARCHAR(150),
  reporter_phone   VARCHAR(20),
  sighting_place   VARCHAR(200) NOT NULL,
  sighting_lat     DECIMAL(10,7),
  sighting_lng     DECIMAL(10,7),
  sighting_datetime DATETIME NOT NULL,
  description      TEXT,
  photo_path       VARCHAR(255),
  is_confirmed     BOOLEAN DEFAULT FALSE,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (missing_person_id) REFERENCES missing_persons(id)
);

-- ── Case status history / audit log ───────────────────────────
CREATE TABLE IF NOT EXISTS case_logs (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  missing_person_id INT NOT NULL,
  action           VARCHAR(100) NOT NULL,
  performed_by     INT,
  notes            TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (missing_person_id) REFERENCES missing_persons(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
);

-- ── Notifications sent to registered users ────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  missing_person_id INT NOT NULL,
  channel          ENUM('sms','push','email','facebook') NOT NULL,
  recipients_count INT DEFAULT 0,
  message          TEXT,
  sent_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (missing_person_id) REFERENCES missing_persons(id)
);

-- ── Face embeddings for AI matching (stored as JSON vectors) ──
CREATE TABLE IF NOT EXISTS face_embeddings (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  missing_person_id INT NOT NULL UNIQUE,
  embedding        JSON NOT NULL,               -- 128-dim face vector
  model_version    VARCHAR(50) DEFAULT 'v1',
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (missing_person_id) REFERENCES missing_persons(id)
);

-- ── Indexes for performance ───────────────────────────────────
CREATE INDEX idx_mp_status    ON missing_persons(status);
CREATE INDEX idx_mp_created   ON missing_persons(created_at);
CREATE INDEX idx_sighting_mp  ON sightings(missing_person_id);
CREATE INDEX idx_log_mp       ON case_logs(missing_person_id);

-- ── Seed: default superadmin account (password: Admin@DCPO2026) ──
INSERT INTO users (full_name, phone, email, password_hash, role, is_verified)
VALUES (
  'DCPO System Admin',
  '09000000000',
  'admin@dcpo.gov.ph',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVzm7GKFK2', -- hashed
  'superadmin',
  TRUE
);
