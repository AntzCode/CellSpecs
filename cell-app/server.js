require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const PASSWORD = process.env.PASSWORD;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Auth middleware
app.use((req, res, next) => {
  const cookies = req.headers.cookie || '';
  if (req.path === '/login' || req.path === '/login.html' || req.path.startsWith('/css') || req.path.startsWith('/js') || cookies.includes(`auth=${PASSWORD}`)) {
    next();
  } else {
    res.redirect('/login');
  }
});

// Login routes
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  if (req.body.password === PASSWORD) {
    res.setHeader('Set-Cookie', `auth=${PASSWORD}; HttpOnly; Max-Age=86400`);
    res.redirect('/');
  } else {
    res.send('Invalid password');
  }
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'auth=; HttpOnly; Max-Age=0');
  res.redirect('/login');
});

// API to get all cells
app.get('/api/cells', (req, res) => {
  const dataDir = path.join(__dirname, 'data');
  fs.readdir(dataDir, (err, files) => {
    if (err) return res.status(500).send(err);
    const cells = files.filter(f => f.endsWith('.json')).map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, f)));
        return { id: f.replace('.json', ''), ...data };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    res.json(cells);
  });
});

// API to save cell
app.post('/api/cells', (req, res) => {
  const cell = req.body;
  if (!cell.cellNumber) return res.status(400).send('Cell number required');
  const filePath = path.join(__dirname, 'data', `${cell.cellNumber}.json`);
  let existing = {};
  if (fs.existsSync(filePath)) {
    existing = JSON.parse(fs.readFileSync(filePath));
  }
  const updated = { ...existing, ...cell };
  if (updated.voltageRecharge && !updated.rechargeDate) {
    updated.rechargeDate = new Date().toISOString().split('T')[0];
  }
  if (updated.voltage7days && !updated.voltage7daysDate) {
    updated.voltage7daysDate = new Date().toISOString().split('T')[0];
  }
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  res.sendStatus(200);
});

// API to get single cell
app.get('/api/cells/:id', (req, res) => {
  const filePath = path.join(__dirname, 'data', `${req.params.id}.json`);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath));
    res.json(data);
  } else {
    res.status(404).send('Cell not found');
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));