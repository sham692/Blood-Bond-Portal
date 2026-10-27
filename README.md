# Blood Bond

## Set up MySQL in Workbench

1. Start your local MySQL server and open MySQL Workbench.
2. Use MySQL 8.0.16 or newer. Open `schema.sql` with **File → Open SQL Script**, then click the lightning-bolt execute button. It creates or upgrades the `blood_bond` schema, adding users, blood requests (including contact phone), donation units/remaining stock/expiry dates, and the donor eligibility view while preserving existing donation rows. To use inventory and request APIs, rerun the script after updating the application.
3. Run `SELECT COUNT(*) FROM blood_bond.donors;` to confirm the schema exists.

The script also inserts clearly labeled demo records, including a user for each role and donors demonstrating both recent-donation ineligibility and eligibility. These are for local testing only; remove them before using real data. Demo user password hashes are deliberately invalid and cannot be used to log in.

## Configure and start the Node.js server (PowerShell)

Open a terminal in this project directory. Node.js 18 or newer and MySQL Server must be installed and running.

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` and set `DB_PASSWORD` to your local MySQL root password. The server defaults to `root` at `localhost` and the `blood_bond` database; you can leave `DB_USER`, `DB_HOST`, and `DB_NAME` at the sample values. Generate a session secret:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated value in `SESSION_SECRET`. The database-backed admin login uses the `admins` table created by `schema.sql`; no admin credentials belong in `.env`. Generate a bcrypt hash for your chosen admin password (replace the example locally):

```powershell
node -e "require('bcryptjs').hash('replace-with-a-strong-admin-password', 12).then(console.log)"
```

In MySQL Workbench, insert an admin account using the generated hash:

```sql
INSERT INTO blood_bond.admins (username, password)
VALUES ('your-admin-username', 'paste-the-generated-bcrypt-hash-here');
```

Use that username and original password on the Admin login page. Never store the plaintext password or a session-storage flag as the authentication credential; the server validates the bcrypt hash and protects admin APIs with its session cookie.

To email emergency-request contacts when a matching donor registers, set `EMAIL_USER` to your Gmail address and `EMAIL_PASS` to a Google App Password in `.env` (not your regular Gmail password). Enable 2-Step Verification on the Google account before creating an App Password. Requesters can optionally provide a contact email when creating an emergency request. Email notifications are sent to pending requests with the same blood group. Notification errors do not fail donor registration.

For better isolation than using the root account, you can create a dedicated user in a Workbench query tab. Replace the password placeholder with a strong, unique password, then set `DB_USER=blood_bond_app` and `DB_PASSWORD` to that same password in `.env`:

```sql
CREATE USER 'blood_bond_app'@'localhost' IDENTIFIED BY 'replace-with-a-strong-password';
GRANT ALL PRIVILEGES ON blood_bond.* TO 'blood_bond_app'@'localhost';
FLUSH PRIVILEGES;
```

Start the server:

```powershell
npm start
```

Open `http://localhost:3000` in a browser. Do not open the HTML files directly from disk; the pages use the Express API.

## Verify the connection

In a second PowerShell terminal:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

A working application and MySQL connection returns:

```text
status   database
------   --------
ok       connected
```

The homepage and forms use the same API. Submit a registration, then look for it in Workbench:

```sql
USE blood_bond;
SELECT id, name, blood_group, city FROM donors ORDER BY id DESC LIMIT 5;
```

Admin login uses the username and password configured through `.env`; all admin dashboard, delete, and clear-record operations require its server-side session.
Inventory totals are calculated from the donation records, so there is no separately editable stock total that can drift out of sync.

## Important deployment notes

- This is a local-development setup. Express's default session store is memory-only; use a persistent session store, HTTPS, secure secrets, backups, and appropriate access controls before deployment.
- Donor name, phone, age, blood group, and city are personal information. Obtain explicit consent for collection and for displaying contact details in donor search; apply local privacy and healthcare regulations before making the service public.
- The donor-search endpoint intentionally returns the phone number because the existing UI displays it. Restrict that disclosure or require authenticated access if donors have not agreed to public contact.
