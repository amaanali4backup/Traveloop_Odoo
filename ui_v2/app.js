// Traveloop V2 Shared Application Logic

// 1. Mock Data Source (Shared across pages)
const CITIES_DB = [
    { name: "Paris", country: "France", dailyCost: 150, image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400" },
    { name: "Tokyo", country: "Japan", dailyCost: 120, image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400" },
    { name: "New York", country: "USA", dailyCost: 200, image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=400" },
    { name: "London", country: "UK", dailyCost: 180, image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=400" },
    { name: "Dubai", country: "UAE", dailyCost: 250, image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=400" },
    { name: "Bali", country: "Indonesia", dailyCost: 50, image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=400" },
    { name: "Rome", country: "Italy", dailyCost: 130, image: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=400" },
    { name: "Barcelona", country: "Spain", dailyCost: 110, image: "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=400" }
];

const API_BASE = 'http://localhost:3000/api';

const Auth = {
    getToken: () => localStorage.getItem('traveloop_token'),
    logout: () => {
        localStorage.removeItem('traveloop_token');
        localStorage.removeItem('traveloop_user');
        window.location.href = 'auth/login.html';
    },
    protectRoute: () => {
        if (!localStorage.getItem('traveloop_token')) {
            // Adjust redirect based on if we are already in auth/
            if(!window.location.pathname.includes('/auth/')) {
                window.location.href = 'auth/login.html';
            }
        }
    }
};

// 2. Data Access Layer (Client-Server Architecture)
const DAL = {
    saveActiveTripToDB: async function(tripObj) {
        try {
            const res = await fetch(`${API_BASE}/trips`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Auth.getToken()}`
                },
                body: JSON.stringify(tripObj)
            });
            if(res.status === 401) return Auth.logout();
            return await res.json();
        } catch (e) {
            console.error("DB Save Error:", e);
        }
    },
    
    getTripsFromDB: async function() {
        try {
            const res = await fetch(`${API_BASE}/trips`, {
                headers: { 'Authorization': `Bearer ${Auth.getToken()}` }
            });
            if(res.status === 401) return Auth.logout();
            return await res.json();
        } catch (e) {
            console.error("DB Fetch Error:", e);
            return [];
        }
    },
    
    // Maintain a local "draft" state just while traversing pages before saving to DB
    saveActiveDraft: function(tripObj) {
        localStorage.setItem('traveloop_v2_active_draft', JSON.stringify(tripObj));
    },
    
    getActiveDraft: function() {
        const saved = localStorage.getItem('traveloop_v2_active_draft');
        return saved ? JSON.parse(saved) : null;
    },
    
    clearActiveDraft: function() {
        localStorage.removeItem('traveloop_v2_active_draft');
    }
};

// 3. Helper Factory
const Helpers = {
    generateId: () => '_' + Math.random().toString(36).substr(2, 9),
    calculateDays: (start, end) => {
        const s = new Date(start);
        const e = new Date(end);
        const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
        return diff > 0 ? diff : 1;
    },
    getCityData: (cityName) => {
        return CITIES_DB.find(c => c.name === cityName);
    }
};

// Auto-initialize lucide icons if the script is present
document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Auth protection for specific pages
    const path = window.location.pathname;
    if (path.includes('profile.html') || path.includes('create_trip.html') || path.includes('itinerary.html')) {
        Auth.protectRoute();
    }
});

