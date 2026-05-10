const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

async function seed() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
    });

    const cities = [
        { name: "New York", country: "USA", cost: 250, popularity: 100, photo: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=400" },
        { name: "London", country: "UK", cost: 200, popularity: 95, photo: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=400" },
        { name: "Rome", country: "Italy", cost: 160, popularity: 90, photo: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=400" },
        { name: "Sydney", country: "Australia", cost: 180, popularity: 85, photo: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=400" },
        { name: "Bali", country: "Indonesia", cost: 60, popularity: 98, photo: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=400" }
    ];

    try {
        for (const city of cities) {
            await pool.query(
                'INSERT INTO cities (name, country, cost_index, popularity, cover_photo) VALUES (?, ?, ?, ?, ?)',
                [city.name, city.country, city.cost, city.popularity, city.photo]
            );
            console.log(`Inserted ${city.name}!`);
        }
        console.log("Seeding complete.");
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
             console.log("City already exists.");
        } else {
             console.error("Error inserting:", e);
        }
    } finally {
        pool.end();
    }
}

seed();
