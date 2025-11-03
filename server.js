// server.js — FULL BACKEND (NO APPS SCRIPT)
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const app = express();

app.use(bodyParser.json());
app.use(express.static('public')); // Serve frontend

// === CONFIG ===
const PORT = process.env.PORT || 3000;
const SMTP_USER = process.env.SMTP_USER || 'noreply_skypartytm@skyparty.name.ng';
const SMTP_PASS = process.env.SMTP_PASS || 'your-smtp-password';
const SUPPORT_EMAIL = 'support@app.skyparty.name.ng';

// === DATABASE ===
const db = new sqlite3.Database('./data.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS invites (email TEXT, code TEXT, club TEXT, status TEXT, time INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS managers (id TEXT, club TEXT, email TEXT, hash TEXT, pin TEXT, rate INTEGER, earned INTEGER, pending INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS otp (email TEXT, otp TEXT, expiry INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS payouts (uuid TEXT, managerId TEXT, amount INTEGER, time INTEGER, status TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS locked (email TEXT, reason TEXT, time INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS used_questions (question TEXT)`);
});

// === Q&A (HIDDEN) ===
const QA = {
  "What is the name of the first Sky Party™ flight?": "Lagos Elite",
  "Who hosted the inaugural Sky Party™?": "Victor Ade",
  "What is the tail number of the Sky Party™ jet?": "5N-SKY",
  "What color is the Sky Party™ jet interior?": "Midnight Black",
  "Which city hosted Sky Party™ Season 1?": "Abuja",
  "What is the name of the Sky Party™ private lounge?": "Cloud 9",
  "What is the official Sky Party™ hashtag?": "#FlyElite",
  "Which artist performed at Sky Party™ Launch?": "Burna Boy",
  "What is the Sky Party™ dress code?": "Black Tie Only",
  "What is the maximum altitude of a Sky Party™ flight?": "FL450"
};

// === EMAIL ===
const transporter = nodemailer.createTransport({
  host: 'mail.skyparty.name.ng',
  port: 587,
  secure: false,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

// === ROUTES ===
app.get('/api/questions', (req, res) => {
  db.all("SELECT question FROM used_questions", (err, used) => {
    const usedQs = used ? used.map(r => r.question) : [];
    const available = Object.keys(QA).filter(q => !usedQs.includes(q));
    res.json({ questions: available });
  });
});

app.post('/api/requestInvite', (req, res) => {
  const { email, question, answer } = req.body;
  if (!email || !question || !answer) return res.json({ status: "error", message: "Required" });

  db.get("SELECT * FROM locked WHERE email = ?", [email], (err, lock) => {
    if (lock) return res.json({ status: "error", message: `Access denied. Contact ${SUPPORT_EMAIL}` });

    const correct = QA[question];
    if (!correct) return res.json({ status: "error", message: "Invalid question" });

    const key = `attempt_${email}_${question}`;
    const attempts = Number(require('node-cache')(key) || "0") + 1;

    if (correct.toLowerCase() !== answer.trim().toLowerCase()) {
      require('node-cache').set(key, attempts);
      if (attempts >= 4) {
        db.run("INSERT INTO locked (email, reason, time) VALUES (?, ?, ?)", [email, "4 failed", Date.now()]);
        db.run("INSERT INTO used_questions (question) VALUES (?)", [question]);
        return res.json({ status: "error", message: `Locked. Contact ${SUPPORT_EMAIL}` });
      }
      return res.json({ status: "error", message: `Wrong. ${attempts}/4` });
    }

    db.run("INSERT INTO used_questions (question) VALUES (?)", [question]);
    const code = crypto.randomBytes(8).toString('hex').toUpperCase();
    const club = question.includes("first") ? "Lagos Elite" : question.includes("hosted") ? "Victor Ade Club" : "Elite Club";

    db.run("INSERT INTO invites (email, code, club, status, time) VALUES (?, ?, ?, ?, ?)", [email, code, club, "Sent", Date.now()]);
    sendInviteEmail(email, code, club);
    res.json({ status: "success", message: "Invite sent!" });
  });
});

// ... (other routes: validate, activate, OTP, payout — same logic as before)

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));