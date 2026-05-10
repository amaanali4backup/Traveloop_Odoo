require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_hackathon_key_traveloop';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files from the ui_v2 folder
const path = require('path');
app.use(express.static(path.join(__dirname, '../ui_v2')));

// Database Pool Placeholder
// Connects to the 'traveloop' database defined in traveloop_schema.sql
let pool;
try {
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'traveloop',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log("MySQL connection pool initialized.");
} catch (error) {
    console.error("Failed to initialize MySQL pool:", error);
}

// === AUTHENTICATION ROUTES (MAPPING to `users` schema) === //

app.post('/api/auth/signup', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        // Map to traveloop schema: users(full_name, email, password_hash)
        const [result] = await pool.query('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)', [name, email, hash]);
        
        const token = jwt.sign({ user_id: result.insertId }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: result.insertId, name, email }});
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email already exists' });
        console.error("Signup DB Error:", error);
        res.status(500).json({ error: "Failed to create account. Database error." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        
        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ user_id: user.user_id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.user_id, name: user.full_name, email: user.email }});
    } catch (error) {
        console.error("Login DB Error:", error);
        res.status(500).json({ error: "Failed to authenticate. Database error." });
    }
});

// === AUTHORIZATION MIDDLEWARE === //
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing Token' });
    }
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user_id = decoded.user_id; // Attach authorized ID
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Token' });
    }
};

// -------------------------------------------------------------------
// REST API ENDPOINTS
// -------------------------------------------------------------------

// 1. Get Master List of Cities
app.get('/api/cities', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT city_id, name, country, cost_index, cover_photo FROM cities ORDER BY popularity DESC LIMIT 20');
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load cities." });
    }
});

// 2. Get All Trips for an Authorized User
app.get('/api/trips', requireAuth, async (req, res) => {
    const userId = req.user_id;
    try {
        const [rows] = await pool.query(`
            SELECT t.trip_id, t.name, t.start_date, t.end_date, t.total_budget, COUNT(ts.stop_id) as stops_count
            FROM trips t
            LEFT JOIN trip_stops ts ON t.trip_id = ts.trip_id
            WHERE t.user_id = ?
            GROUP BY t.trip_id
            ORDER BY t.start_date DESC
        `, [userId]);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load trips." });
    }
});
// 2.5 Get a Specific Trip for an Authorized User
app.get('/api/trips/:id', requireAuth, async (req, res) => {
    const userId = req.user_id;
    const tripId = req.params.id;

    try {
        // Get main trip details
        const [tripRows] = await pool.query(
            'SELECT name, description, total_budget FROM trips WHERE trip_id = ? AND user_id = ?',
            [tripId, userId]
        );

        if (tripRows.length === 0) {
            return res.status(404).json({ error: "Trip not found or unauthorized." });
        }

        const trip = tripRows[0];

        // Get stops details
        const [stopRows] = await pool.query(`
            SELECT ts.stop_id, ts.city_id, ts.arrival_date, ts.departure_date, c.name as city_name, c.country
            FROM trip_stops ts
            JOIN cities c ON ts.city_id = c.city_id
            WHERE ts.trip_id = ?
            ORDER BY ts.stop_order ASC
        `, [tripId]);

        // Format to match frontend state format
        const formattedStops = stopRows.map(stop => {
            const start = new Date(stop.arrival_date.getTime() - (stop.arrival_date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            const end = new Date(stop.departure_date.getTime() - (stop.departure_date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            const sDate = new Date(start);
            const eDate = new Date(end);
            const diff = Math.ceil((eDate - sDate) / (1000 * 60 * 60 * 24));
            const duration = diff > 0 ? diff : 1;

            return {
                id: `stop_${stop.stop_id}`,
                city_id: stop.city_id,
                city: stop.city_name,
                start: start,
                end: end,
                duration: duration
            };
        });

        res.json({
            name: trip.name,
            desc: trip.description,
            totalBudget: trip.total_budget,
            stops: formattedStops
        });
    } catch (error) {
        console.error("Fetch Trip Error:", error);
        res.status(500).json({ error: "Failed to fetch trip details." });
    }
});

// 3. Create a New Trip and Stops for an Authorized User
app.post('/api/trips', requireAuth, async (req, res) => {
    const userId = req.user_id;
    const { name, desc, stops, totalBudget } = req.body;
    
    if (!stops || stops.length === 0) {
        return res.status(400).json({ error: "Trip must have at least one stop." });
    }

    // Calculate overall start and end dates from stops
    const dates = stops.flatMap(s => [new Date(s.start), new Date(s.end)]);
    const startDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
    const endDate = new Date(Math.max(...dates)).toISOString().split('T')[0];

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Insert into trips
        const [tripResult] = await connection.query(
            'INSERT INTO trips (user_id, name, description, start_date, end_date, total_budget) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, name || 'My Trip', desc || null, startDate, endDate, totalBudget || 0]
        );
        const tripId = tripResult.insertId;

        // Insert stops
        for (let i = 0; i < stops.length; i++) {
            const stop = stops[i];
            let cityId = stop.city_id;

            if (!cityId && stop.city) {
                // Fallback for older drafts in local storage
                const [cityRows] = await connection.query('SELECT city_id FROM cities WHERE name = ?', [stop.city]);
                if (cityRows.length > 0) {
                    cityId = cityRows[0].city_id;
                } else {
                    throw new Error(`City ${stop.city} not found in database.`);
                }
            }

            await connection.query(
                'INSERT INTO trip_stops (trip_id, city_id, stop_order, arrival_date, departure_date) VALUES (?, ?, ?, ?, ?)',
                [tripId, cityId, i + 1, stop.start, stop.end]
            );
        }

        await connection.commit();
        res.status(201).json({ success: true, message: "Trip successfully saved to database.", trip_id: tripId });
    } catch (error) {
        await connection.rollback();
        console.error("Transaction Error:", error);
        res.status(500).json({ error: "Failed to save trip to database." });
    } finally {
        connection.release();
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Traveloop V2 Backend running on http://localhost:${PORT}`);
});
