CREATE DATABASE IF NOT EXISTS blood_bond
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE blood_bond;

CREATE TABLE IF NOT EXISTS donors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
  age TINYINT UNSIGNED NOT NULL,
  gender ENUM('Male', 'Female', 'Other') NOT NULL DEFAULT 'Other',
  phone VARCHAR(10) NOT NULL,
  email VARCHAR(254) NULL,
  city VARCHAR(100) NOT NULL,
  amount_ml SMALLINT UNSIGNED NOT NULL,
  last_donation DATE NULL,
  address VARCHAR(255) NULL,
  registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_donors_search (blood_group, city),
  KEY idx_donors_registered_at (registered_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'donor', 'recipient') NOT NULL DEFAULT 'donor',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  password VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS donations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  donor_id BIGINT UNSIGNED NULL,
  donor_name VARCHAR(120) NOT NULL,
  blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
  amount_ml SMALLINT UNSIGNED NOT NULL,
  units_donated SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  units_remaining SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  donation_date DATE NOT NULL,
  expiry_date DATE GENERATED ALWAYS AS (DATE_ADD(donation_date, INTERVAL 35 DAY)) STORED,
  city VARCHAR(100) NOT NULL,
  camp VARCHAR(160) NULL,
  contact VARCHAR(10) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_donations_group_date (blood_group, donation_date),
  KEY idx_donations_date (donation_date),
  KEY idx_donations_donor_date (donor_id, donation_date),
  CONSTRAINT fk_donations_donor
    FOREIGN KEY (donor_id) REFERENCES donors(id)
    ON DELETE SET NULL,
  CONSTRAINT chk_donations_units CHECK (units_donated > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS blood_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_name VARCHAR(120) NOT NULL,
  blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
  units_needed SMALLINT UNSIGNED NOT NULL,
  hospital_name VARCHAR(160) NOT NULL,
  city VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  contact_email VARCHAR(254) NULL,
  urgency_level ENUM('Critical', 'Moderate') NOT NULL,
  status ENUM('Pending', 'Fulfilled') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_blood_requests_search (status, blood_group, city),
  KEY idx_blood_requests_urgency (urgency_level, created_at),
  KEY idx_blood_requests_created (created_at),
  CONSTRAINT chk_blood_requests_units CHECK (units_needed > 0)
) ENGINE=InnoDB;

-- Upgrade existing installations without replacing their donation records.
DROP PROCEDURE IF EXISTS add_donation_feature_columns;
DELIMITER //
CREATE PROCEDURE add_donation_feature_columns()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'donations'
      AND COLUMN_NAME = 'units_donated'
  ) THEN
    ALTER TABLE donations
      ADD COLUMN units_donated SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER amount_ml;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'donations'
      AND COLUMN_NAME = 'expiry_date'
  ) THEN
    ALTER TABLE donations
      ADD COLUMN expiry_date DATE
        GENERATED ALWAYS AS (DATE_ADD(donation_date, INTERVAL 35 DAY)) STORED
        AFTER donation_date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'donations'
      AND COLUMN_NAME = 'units_remaining'
  ) THEN
    ALTER TABLE donations
      ADD COLUMN units_remaining SMALLINT UNSIGNED NOT NULL DEFAULT 1
        AFTER units_donated;
    UPDATE donations SET units_remaining = units_donated;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'donations'
      AND INDEX_NAME = 'idx_donations_donor_date'
  ) THEN
    ALTER TABLE donations
      ADD KEY idx_donations_donor_date (donor_id, donation_date);
  END IF;
END//
DELIMITER ;
CALL add_donation_feature_columns();
DROP PROCEDURE add_donation_feature_columns;

-- Add the emergency-request contact column to existing installations.
DROP PROCEDURE IF EXISTS add_blood_request_contact_column;
DELIMITER //
CREATE PROCEDURE add_blood_request_contact_column()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'blood_requests'
      AND COLUMN_NAME = 'contact_phone'
  ) THEN
    ALTER TABLE blood_requests
      ADD COLUMN contact_phone VARCHAR(20) NULL AFTER city;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'blood_requests'
      AND COLUMN_NAME = 'contact_email'
  ) THEN
    ALTER TABLE blood_requests
      ADD COLUMN contact_email VARCHAR(254) NULL AFTER contact_phone;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'blood_requests'
      AND INDEX_NAME = 'idx_blood_requests_created'
  ) THEN
    ALTER TABLE blood_requests
      ADD KEY idx_blood_requests_created (created_at);
  END IF;
END//
DELIMITER ;
CALL add_blood_request_contact_column();
DROP PROCEDURE add_blood_request_contact_column;

CREATE OR REPLACE VIEW donor_eligibility AS
SELECT
  latest_donations.donor_id,
  latest_donations.name,
  latest_donations.blood_group,
  latest_donations.latest_donation,
  CASE
    WHEN latest_donations.latest_donation IS NULL
      OR latest_donations.latest_donation < DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)
    THEN TRUE
    ELSE FALSE
  END AS is_eligible,
  CASE
    WHEN latest_donations.latest_donation IS NULL
      OR latest_donations.latest_donation < DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)
    THEN NULL
    ELSE DATE_ADD(latest_donations.latest_donation, INTERVAL 91 DAY)
  END AS eligible_again_on
FROM (
  SELECT
    d.id AS donor_id,
    d.name,
    d.blood_group,
    COALESCE(
      GREATEST(d.last_donation, donation_history.latest_donation),
      d.last_donation,
      donation_history.latest_donation
    ) AS latest_donation
  FROM donors AS d
  LEFT JOIN (
    SELECT donor_id, MAX(donation_date) AS latest_donation
    FROM donations
    WHERE donor_id IS NOT NULL
    GROUP BY donor_id
  ) AS donation_history ON donation_history.donor_id = d.id
) AS latest_donations;

-- Demonstration rows only. Replace/remove them before using this database with real data.
INSERT INTO users (username, email, password_hash, role)
SELECT 'demo_admin', 'demo_admin@example.invalid', 'NOT_A_REAL_PASSWORD_HASH', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'demo_admin');

INSERT INTO users (username, email, password_hash, role)
SELECT 'demo_donor', 'demo_donor@example.invalid', 'NOT_A_REAL_PASSWORD_HASH', 'donor'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'demo_donor');

INSERT INTO users (username, email, password_hash, role)
SELECT 'demo_recipient', 'demo_recipient@example.invalid', 'NOT_A_REAL_PASSWORD_HASH', 'recipient'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'demo_recipient');

INSERT INTO donors
  (name, blood_group, age, gender, phone, email, city, amount_ml, last_donation, address)
SELECT
  'Demo Donor Recent', 'O+', 29, 'Other', '9000000001',
  'demo_recent@example.invalid', 'Demo City', 450, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM donors WHERE email = 'demo_recent@example.invalid');

INSERT INTO donors
  (name, blood_group, age, gender, phone, email, city, amount_ml, last_donation, address)
SELECT
  'Demo Donor Eligible', 'A+', 34, 'Other', '9000000002',
  'demo_eligible@example.invalid', 'Demo City', 450, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM donors WHERE email = 'demo_eligible@example.invalid');

INSERT INTO donations
  (donor_id, donor_name, blood_group, amount_ml, units_donated, donation_date, city, camp, contact)
SELECT
  d.id, d.name, d.blood_group, 450, 1, DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY),
  d.city, 'Demo Camp', d.phone
FROM donors AS d
WHERE d.email = 'demo_recent@example.invalid'
  AND NOT EXISTS (
    SELECT 1 FROM donations AS existing
    WHERE existing.donor_id = d.id
      AND existing.camp = 'Demo Camp'
  );

INSERT INTO donations
  (donor_id, donor_name, blood_group, amount_ml, units_donated, donation_date, city, camp, contact)
SELECT
  d.id, d.name, d.blood_group, 450, 1, DATE_SUB(CURRENT_DATE, INTERVAL 120 DAY),
  d.city, 'Demo Eligible Camp', d.phone
FROM donors AS d
WHERE d.email = 'demo_eligible@example.invalid'
  AND NOT EXISTS (
    SELECT 1 FROM donations AS existing
    WHERE existing.donor_id = d.id
      AND existing.camp = 'Demo Eligible Camp'
  );

INSERT INTO blood_requests
  (patient_name, blood_group, units_needed, hospital_name, city, contact_phone, urgency_level, status)
SELECT
  'Demo Patient Critical', 'O+', 2, 'Demo General Hospital', 'Demo City',
  '9000000101', 'Critical', 'Pending'
WHERE NOT EXISTS (
  SELECT 1 FROM blood_requests
  WHERE patient_name = 'Demo Patient Critical'
    AND hospital_name = 'Demo General Hospital'
    AND city = 'Demo City'
);

INSERT INTO blood_requests
  (patient_name, blood_group, units_needed, hospital_name, city, contact_phone, urgency_level, status)
SELECT
  'Demo Patient Moderate', 'A+', 1, 'Demo Community Hospital', 'Demo City',
  '9000000102', 'Moderate', 'Fulfilled'
WHERE NOT EXISTS (
  SELECT 1 FROM blood_requests
  WHERE patient_name = 'Demo Patient Moderate'
    AND hospital_name = 'Demo Community Hospital'
    AND city = 'Demo City'
);
