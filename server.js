require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const { rateLimit } = require("express-rate-limit");

const requiredEnv = ["DB_PASSWORD", "SESSION_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "blood_bond",
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
const mailTransporter = process.env.EMAIL_USER && process.env.EMAIL_PASS
  ? nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  })
  : null;

async function sendAlertEmail(toEmail, subject, text) {
  if (!mailTransporter) {
    console.warn("Email alert skipped: configure EMAIL_USER and EMAIL_PASS in .env.");
    return false;
  }
  try {
    await mailTransporter.sendMail({
      from: `"Blood Bond Alert" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject,
      text
    });
    console.log(`✅ Emergency Alert Email dispatched successfully to: ${toEmail}`);
    return true;
  } catch (err) {
    console.error("❌ Email dispatch failed:", err.message);
    return false;
  }
}

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true, limit: "20kb" }));
app.use(session({
  name: "bloodbond.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const validGenders = ["Male", "Female", "Other"];

function apiError(res, status, message) {
  return res.status(status).json({ error: message });
}

function hasText(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function validOptionalText(value, maxLength) {
  return value == null || value === ""
    || (typeof value === "string" && value.trim().length <= maxLength);
}

function optionalText(value) {
  return typeof value === "string" ? value.trim() || null : null;
}

function validDate(value, allowEmpty = false) {
  if (allowEmpty && !value) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validDonationAmount(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 100 && Number(value) <= 600;
}

async function notifyMatchingBloodRequests(donor) {
  try {
    const [requests] = await pool.query(
      "SELECT id, contact_email FROM blood_requests WHERE blood_group = ? AND status = 'Pending'",
      [donor.bloodGroup]
    );

    for (const request of requests) {
      if (!request.contact_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.contact_email)) {
        continue;
      }
      const message = `Hello,

Good news! A matching blood donor has registered on Blood Bond:

- Donor Name: ${donor.name}
- Blood Group: ${donor.bloodGroup}
- City: ${donor.city}
- Contact Phone: ${donor.phone}

Please contact the donor immediately if required.

Regards,
Blood Bond Team`;
      await sendAlertEmail(
        request.contact_email,
        "Urgent Alert: Matching Blood Donor Found - Blood Bond",
        message
      );
    }
  } catch (error) {
    console.error("Could not check or notify matching blood requests:", error.message);
  }
}

function requireAdmin(req, res, next) {
  if (!req.session.admin) return apiError(res, 401, "Admin login required.");
  next();
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false
});
const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

app.get("/api/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/summary", async (_req, res, next) => {
  try {
    const [summary] = await pool.execute(
      `SELECT bg.blood_group AS bloodGroup,
              COALESCE(d.donors, 0) AS donors,
              COALESCE(c.donations, 0) AS donations,
              COALESCE(c.ml, 0) AS ml,
              COALESCE(DATE_FORMAT(c.lastCollection, '%Y-%m-%d'), '-') AS lastCollection
       FROM (
         SELECT 'A+' AS blood_group UNION ALL SELECT 'A-' UNION ALL SELECT 'B+' UNION ALL SELECT 'B-'
         UNION ALL SELECT 'AB+' UNION ALL SELECT 'AB-' UNION ALL SELECT 'O+' UNION ALL SELECT 'O-'
       ) bg
       LEFT JOIN (
         SELECT blood_group, COUNT(*) AS donors FROM donors GROUP BY blood_group
       ) d ON d.blood_group = bg.blood_group
       LEFT JOIN (
         SELECT blood_group, COUNT(*) AS donations, SUM(amount_ml) AS ml,
                MAX(donation_date) AS lastCollection
         FROM donations GROUP BY blood_group
       ) c ON c.blood_group = bg.blood_group
       ORDER BY FIELD(bg.blood_group, 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`
    );
    const [[totals]] = await pool.execute(
      `SELECT (SELECT COUNT(*) FROM donors) AS donors,
              (SELECT COUNT(*) FROM donations) AS collections,
              (SELECT COALESCE(SUM(amount_ml), 0) FROM donations) AS totalMl`
    );
    res.json({ ...totals, summary });
  } catch (error) {
    next(error);
  }
});

app.get("/api/impact", async (_req, res, next) => {
  try {
    const [[impact]] = await pool.execute(
      `SELECT (SELECT COUNT(*) FROM donors) AS donors,
              (SELECT COUNT(*) FROM blood_requests WHERE status = 'Fulfilled') AS fulfilledRequests,
              (SELECT COUNT(DISTINCT TRIM(city)) FROM donors WHERE TRIM(city) <> '') AS cities`
    );
    res.json(impact);
  } catch (error) {
    next(error);
  }
});

app.post("/api/donors", async (req, res, next) => {
  const donor = req.body || {};
  const age = Number(donor.age);
  const amountMl = Number(donor.amountMl);
  if (!hasText(donor.name, 120)
      || !bloodGroups.includes(donor.bloodGroup)
      || !Number.isInteger(age) || age < 18 || age > 65
      || !validGenders.includes(donor.gender)
      || !/^\d{10}$/.test(donor.phone || "")
      || !hasText(donor.city, 100)
      || !validDonationAmount(amountMl)
      || !validOptionalText(donor.email, 254)
      || (donor.lastDonation && !validDate(donor.lastDonation))
      || !validOptionalText(donor.address, 255)) {
    return apiError(res, 400, "Please provide valid donor details.");
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO donors
       (name, blood_group, age, gender, phone, email, city, amount_ml, last_donation, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        donor.name.trim(), donor.bloodGroup, age, donor.gender, donor.phone,
        optionalText(donor.email), donor.city.trim(), amountMl,
        donor.lastDonation || null, optionalText(donor.address)
      ]
    );
    await notifyMatchingBloodRequests({
      name: donor.name.trim(),
      bloodGroup: donor.bloodGroup,
      city: donor.city.trim(),
      phone: donor.phone
    });
    res.status(201).json({ id: result.insertId, message: "Donor registered." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/donors", async (req, res, next) => {
  const group = req.query.group || "";
  const city = (req.query.city || "").trim();
  const sortColumns = { name: "name", city: "city", recent: "registered_at" };
  const sort = sortColumns[req.query.sort] || sortColumns.name;
  const limit = req.query.limit === undefined ? null : Number(req.query.limit);
  if (group && !bloodGroups.includes(group)) return apiError(res, 400, "Invalid blood group.");
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    return apiError(res, 400, "Limit must be an integer between 1 and 100.");
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, name, blood_group AS bloodGroup, age, gender, phone, city,
              amount_ml AS amountMl, last_donation AS lastDonation, registered_at AS registeredAt
       FROM donors
       WHERE (? = '' OR blood_group = ?)
         AND (? = '' OR city LIKE ?)
       ORDER BY ${sort} ${req.query.sort === "recent" ? "DESC" : "ASC"}${limit === null ? "" : " LIMIT ?"}`,
      limit === null ? [group, group, city, `%${city}%`] : [group, group, city, `%${city}%`, limit]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/donors/available", async (req, res, next) => {
  const group = req.query.group || "";
  const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
  if (group && !bloodGroups.includes(group)) return apiError(res, 400, "Invalid blood group.");

  try {
    const [rows] = await pool.execute(
      `SELECT d.id, d.name, d.blood_group AS bloodGroup, d.age, d.gender, d.phone,
              d.city, d.amount_ml AS amountMl, d.last_donation AS lastDonation,
              d.registered_at AS registeredAt, eligibility.latest_donation AS latestDonation
       FROM donor_eligibility AS eligibility
       JOIN donors AS d ON d.id = eligibility.donor_id
       WHERE eligibility.is_eligible = TRUE
         AND (? = '' OR d.blood_group = ?)
         AND (? = '' OR d.city LIKE ?)
       ORDER BY d.name ASC`,
      [group, group, city, `%${city}%`]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/donors/:id/history", requireAdmin, async (req, res, next) => {
  const donorId = Number(req.params.id);
  if (!Number.isSafeInteger(donorId) || donorId < 1) return apiError(res, 400, "Invalid donor ID.");

  try {
    const [donors] = await pool.execute(
      `SELECT id, name, blood_group AS bloodGroup, registered_at AS registeredAt
       FROM donors WHERE id = ?`,
      [donorId]
    );
    if (!donors.length) return apiError(res, 404, "Donor not found.");

    const [donations] = await pool.execute(
      `SELECT id, blood_group AS bloodGroup, amount_ml AS amountMl,
              units_donated AS unitsDonated, donation_date AS donationDate,
              expiry_date AS expiryDate, city, camp
       FROM donations
       WHERE donor_id = ?
       ORDER BY donation_date DESC, id DESC`,
      [donorId]
    );
    res.json({ donor: donors[0], donations });
  } catch (error) {
    next(error);
  }
});

app.put("/api/requests/:id/fulfill", requireAdmin, async (req, res, next) => {
  const requestId = Number(req.params.id);
  if (!Number.isSafeInteger(requestId) || requestId < 1) return apiError(res, 400, "Invalid request ID.");

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [requests] = await connection.execute(
      `SELECT id, blood_group, units_needed, status
       FROM blood_requests WHERE id = ? FOR UPDATE`,
      [requestId]
    );
    if (!requests.length) {
      await connection.rollback();
      return apiError(res, 404, "Blood request not found.");
    }
    const request = requests[0];
    if (request.status !== "Pending") {
      await connection.rollback();
      return apiError(res, 409, "Blood request has already been fulfilled.");
    }

    const [batches] = await connection.execute(
      `SELECT id, units_remaining
       FROM donations
       WHERE blood_group = ?
         AND units_remaining > 0
         AND expiry_date >= CURRENT_DATE()
       ORDER BY expiry_date ASC, donation_date ASC, id ASC
       FOR UPDATE`,
      [request.blood_group]
    );
    const availableUnits = batches.reduce((total, batch) => total + Number(batch.units_remaining), 0);
    if (availableUnits < Number(request.units_needed)) {
      await connection.rollback();
      return res.status(409).json({
        error: "Insufficient unexpired inventory to fulfill this request.",
        availableUnits,
        unitsNeeded: Number(request.units_needed)
      });
    }

    let unitsToDeduct = Number(request.units_needed);
    for (const batch of batches) {
      if (unitsToDeduct === 0) break;
      const deduction = Math.min(unitsToDeduct, Number(batch.units_remaining));
      await connection.execute(
        "UPDATE donations SET units_remaining = units_remaining - ? WHERE id = ?",
        [deduction, batch.id]
      );
      unitsToDeduct -= deduction;
    }

    await connection.execute(
      "UPDATE blood_requests SET status = 'Fulfilled' WHERE id = ?",
      [requestId]
    );
    await connection.commit();
    res.json({ id: requestId, status: "Fulfilled", unitsDeducted: Number(request.units_needed) });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
});

app.get("/api/inventory", async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT bg.blood_group AS bloodGroup,
              COALESCE(SUM(
                CASE WHEN d.expiry_date >= CURRENT_DATE() THEN d.units_remaining ELSE 0 END
              ), 0) AS unitsInStock
       FROM (
         SELECT 'A+' AS blood_group UNION ALL SELECT 'A-' UNION ALL SELECT 'B+' UNION ALL SELECT 'B-'
         UNION ALL SELECT 'AB+' UNION ALL SELECT 'AB-' UNION ALL SELECT 'O+' UNION ALL SELECT 'O-'
       ) AS bg
       LEFT JOIN donations AS d ON d.blood_group = bg.blood_group
       GROUP BY bg.blood_group
       ORDER BY FIELD(bg.blood_group, 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/inventory/expiring-soon", async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, donor_name AS donorName, blood_group AS bloodGroup,
              units_remaining AS unitsRemaining, donation_date AS donationDate,
              expiry_date AS expiryDate, city, camp
       FROM donations
       WHERE units_remaining > 0
         AND expiry_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)
       ORDER BY expiry_date ASC, blood_group ASC, id ASC`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/stats", requireAdmin, async (_req, res, next) => {
  try {
    const [[stats]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM donors) AS totalDonors,
         (SELECT COUNT(*) FROM blood_requests WHERE status = 'Pending') AS pendingRequests,
         (SELECT COUNT(*) FROM blood_requests WHERE status = 'Fulfilled') AS fulfilledRequests`
    );
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/requests/:id/fulfill", requireAdmin, async (req, res, next) => {
  const requestId = Number(req.params.id);
  if (!Number.isSafeInteger(requestId) || requestId < 1) {
    return apiError(res, 400, "Invalid request ID.");
  }

  try {
    const [result] = await pool.query(
      "UPDATE blood_requests SET status = 'Fulfilled' WHERE id = ?",
      [requestId]
    );
    if (!result.affectedRows) return apiError(res, 404, "Blood request not found.");
    res.json({ id: requestId, status: "Fulfilled", updated: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/requests/:id", requireAdmin, async (req, res, next) => {
  const requestId = Number(req.params.id);
  if (!Number.isSafeInteger(requestId) || requestId < 1) {
    return apiError(res, 400, "Invalid request ID.");
  }

  try {
    const [result] = await pool.query(
      "DELETE FROM blood_requests WHERE id = ?",
      [requestId]
    );
    if (!result.affectedRows) return apiError(res, 404, "Blood request not found.");
    res.json({ id: requestId, deleted: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/donations", async (req, res, next) => {
  const donation = req.body || {};
  const amountMl = Number(donation.amountMl);
  const donorId = donation.donorId ? Number(donation.donorId) : null;
  if (!hasText(donation.donorName, 120)
      || !bloodGroups.includes(donation.bloodGroup)
      || !validDonationAmount(amountMl)
      || !validDate(donation.date)
      || !hasText(donation.city, 100)
      || !validOptionalText(donation.camp, 160)
      || (donation.contact != null && donation.contact !== ""
        && (typeof donation.contact !== "string" || !/^\d{10}$/.test(donation.contact)))
      || (donorId !== null && (!Number.isSafeInteger(donorId) || donorId < 1))) {
    return apiError(res, 400, "Please provide valid donation details.");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (donorId) {
      const [registeredDonors] = await connection.execute(
        "SELECT blood_group FROM donors WHERE id = ? FOR UPDATE",
        [donorId]
      );
      if (!registeredDonors.length) {
        await connection.rollback();
        return apiError(res, 400, "Selected donor does not exist.");
      }
      if (registeredDonors[0].blood_group !== donation.bloodGroup) {
        await connection.rollback();
        return apiError(res, 400, "Selected donor blood group does not match.");
      }
    }
    const [result] = await connection.execute(
      `INSERT INTO donations
       (donor_id, donor_name, blood_group, amount_ml, donation_date, city, camp, contact)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        donorId, donation.donorName.trim(), donation.bloodGroup, amountMl,
        donation.date, donation.city.trim(), optionalText(donation.camp),
        optionalText(donation.contact)
      ]
    );
    if (donorId) {
      await connection.execute("UPDATE donors SET last_donation = ? WHERE id = ?", [donation.date, donorId]);
    }
    await connection.commit();
    res.status(201).json({ id: result.insertId, message: "Donation recorded." });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get("/api/donations/recent", async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, donor_name AS donorName, blood_group AS bloodGroup, amount_ml AS amountMl,
              donation_date AS date, city, camp
       FROM donations ORDER BY donation_date DESC, id DESC LIMIT 8`
    );
    const [todayRows] = await pool.execute(
      "SELECT COALESCE(SUM(amount_ml), 0) AS amountMl FROM donations WHERE donation_date = CURRENT_DATE()"
    );
    res.json({ rows, todayMl: todayRows[0].amountMl });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", loginLimiter, async (req, res, next) => {
  const { username, password } = req.body || {};
  console.info("[Admin login] Attempt received.");
  if (typeof username !== "string" || typeof password !== "string"
      || !username.trim() || !password) {
    console.warn("[Admin login] Missing or invalid credentials format.");
    return apiError(res, 400, "Username and password are required.");
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, username, password FROM admins WHERE username = ? LIMIT 1",
      [username.trim()]
    );
    if (rows.length === 0) {
      console.warn("[Admin login] No matching admin account.");
      return apiError(res, 401, "Invalid username or password.");
    }

    const admin = rows[0];
    const isBcryptHash = typeof admin.password === "string" && admin.password.startsWith("$2");
    const isMatch = isBcryptHash
      ? await bcrypt.compare(password, admin.password).catch((error) => {
        console.error("[Admin login] Bcrypt verification failed.", error.message);
        return false;
      })
      : false;
    console.info("[Admin login] Account found; bcrypt verification:", isMatch);
    if (!isMatch) {
      console.warn("[Admin login] Password verification failed.");
      return apiError(res, 401, "Invalid username or password.");
    }

    req.session.regenerate((error) => {
      if (error) {
        console.error("[Admin login] Session regeneration failed.", error.message);
        return next(error);
      }
      req.session.admin = { id: admin.id, username: admin.username };
      console.info("[Admin login] Authentication succeeded; session created.");
      res.json({
        success: true,
        message: "Login successful",
        user: { id: admin.id, username: admin.username }
      });
    });
  } catch (error) {
    console.error("[Admin login] Database or authentication error.", error.message);
    next(error);
  }
});

app.get("/api/admin/session", (req, res) => {
  res.json({
    authenticated: Boolean(req.session.admin),
    username: req.session.admin ? req.session.admin.username : null
  });
});

app.post("/api/admin/logout", requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("bloodbond.sid");
    res.json({ authenticated: false });
  });
});

app.get("/api/admin/dashboard", requireAdmin, async (_req, res, next) => {
  try {
    const [donors] = await pool.execute(
      `SELECT id, name, blood_group AS bloodGroup, age, gender, phone, email, city,
              amount_ml AS amountMl, last_donation AS lastDonation, registered_at AS registeredAt
       FROM donors ORDER BY registered_at DESC`
    );
    const [donations] = await pool.execute(
      `SELECT id, donor_name AS donorName, blood_group AS bloodGroup, amount_ml AS amountMl,
              donation_date AS date, city, camp, created_at AS createdAt
       FROM donations ORDER BY donation_date DESC, id DESC`
    );
    const [summary] = await pool.execute(
      `SELECT bg.blood_group AS bloodGroup,
              COALESCE(d.donors, 0) AS donors,
              COALESCE(c.donations, 0) AS donations,
              COALESCE(c.ml, 0) AS ml,
              COALESCE(DATE_FORMAT(c.lastCollection, '%Y-%m-%d'), '-') AS lastCollection
       FROM (
         SELECT 'A+' AS blood_group UNION ALL SELECT 'A-' UNION ALL SELECT 'B+' UNION ALL SELECT 'B-'
         UNION ALL SELECT 'AB+' UNION ALL SELECT 'AB-' UNION ALL SELECT 'O+' UNION ALL SELECT 'O-'
       ) bg
       LEFT JOIN (
         SELECT blood_group, COUNT(*) AS donors FROM donors GROUP BY blood_group
       ) d ON d.blood_group = bg.blood_group
       LEFT JOIN (
         SELECT blood_group, COUNT(*) AS donations, SUM(amount_ml) AS ml,
                MAX(donation_date) AS lastCollection
         FROM donations GROUP BY blood_group
       ) c ON c.blood_group = bg.blood_group
       ORDER BY FIELD(bg.blood_group, 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`
    );
    res.json({ donors, donations, summary });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/donations", requireAdmin, async (req, res, next) => {
  const donation = req.body || {};
  const amountMl = Number(donation.amountMl);
  if (!hasText(donation.donorName, 120)
      || !bloodGroups.includes(donation.bloodGroup)
      || !validDonationAmount(amountMl) || !validDate(donation.date)
      || !validOptionalText(donation.city, 100)) {
    return apiError(res, 400, "Please provide valid collection details.");
  }
  try {
    const [result] = await pool.execute(
      `INSERT INTO donations (donor_name, blood_group, amount_ml, donation_date, city)
       VALUES (?, ?, ?, ?, ?)`,
      [donation.donorName.trim(), donation.bloodGroup, amountMl, donation.date, optionalText(donation.city) || ""]
    );
    res.status(201).json({ id: result.insertId, message: "Collection recorded." });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/donations/:id", requireAdmin, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return apiError(res, 400, "Invalid record ID.");
  try {
    const [result] = await pool.execute("DELETE FROM donations WHERE id = ?", [id]);
    if (!result.affectedRows) return apiError(res, 404, "Collection record not found.");
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

app.delete(["/api/donors/:id", "/api/admin/donors/:id"], requireAdmin, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return apiError(res, 400, "Invalid donor ID.");
  try {
    const [result] = await pool.execute("DELETE FROM donors WHERE id = ?", [id]);
    if (!result.affectedRows) return apiError(res, 404, "Donor not found.");
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/records", requireAdmin, async (_req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM donations");
    await connection.query("DELETE FROM donors");
    await connection.commit();
    res.json({ cleared: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get("/api/requests", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM blood_requests ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/requests", requestLimiter, async (req, res, next) => {
  const {
    patient_name: patientName,
    blood_group: bloodGroup,
    units_needed: unitsNeededValue,
    hospital_name: hospitalName,
    city,
    contact_phone: contactPhone,
    contact_email: contactEmailValue,
    urgency_level: urgencyLevel
  } = req.body || {};
  const effectiveUrgencyLevel = urgencyLevel || "Moderate";
  const contactEmail = optionalText(contactEmailValue);
  const requiredValues = [
    patientName, bloodGroup, unitsNeededValue, hospitalName, city, contactPhone
  ];

  if (requiredValues.some((value) => value === undefined || value === null
      || (typeof value === "string" && value.trim() === ""))) {
    return apiError(res, 400, "All fields are required.");
  }

  const unitsNeeded = Number(unitsNeededValue);
  if (!hasText(patientName, 120)
      || !bloodGroups.includes(bloodGroup)
      || !Number.isInteger(unitsNeeded) || unitsNeeded < 1 || unitsNeeded > 1000
      || !hasText(hospitalName, 160)
      || !hasText(city, 100)
      || typeof contactPhone !== "string" || !/^\+?[0-9 ()-]{7,20}$/.test(contactPhone.trim())
      || !validOptionalText(contactEmailValue, 254)
      || (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
      || !["Critical", "Moderate"].includes(effectiveUrgencyLevel)) {
    return apiError(res, 400, "Please provide valid emergency request details.");
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO blood_requests
       (patient_name, blood_group, units_needed, hospital_name, city, contact_phone, contact_email, urgency_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientName.trim(), bloodGroup, unitsNeeded, hospitalName.trim(), city.trim(),
        contactPhone.trim(), contactEmail, effectiveUrgencyLevel
      ]
    );
    res.status(201).json({
      message: "Request created successfully",
      id: result.insertId
    });
  } catch (error) {
    next(error);
  }
});

app.get(["/", "/index.html", "/register.html", "/donate.html", "/find-donor.html", "/about.html", "/contact.html", "/admin.html"], (req, res) => {
  const filename = req.path === "/" ? "index.html" : req.path.slice(1);
  res.sendFile(path.join(__dirname, filename));
});
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use((req, res) => apiError(res, 404, "Not found."));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, "body")) {
    return apiError(res, 400, "Invalid JSON request body.");
  }
  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return apiError(res, 400, "Selected donor does not exist.");
  }
  apiError(res, 500, "An unexpected server error occurred.");
});

pool.query("SELECT 1")
  .then(() => {
    app.listen(port, () => console.log(`Blood Bond server listening at http://localhost:${port}`));
  })
  .catch((error) => {
    console.error("Could not connect to MySQL:", error.message);
    process.exitCode = 1;
  });
