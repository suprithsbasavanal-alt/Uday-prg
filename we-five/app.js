// State
const state = {
    reports: [],
    // Local mock removed/unused in favor of Supabase for Challans
    // For reports, we still keep local array for the session unless user wants that DB-backed too (not requested yet)
    currentLocation: null,
    map: null,
    mapInitialized: false,
    routeLayer: null
};

// --- Supabase Config ---
const SUPABASE_URL = 'https://ujdkknwisgnkclldmhou.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-4T-0gPFsuzLh5UmkPEsOg_3vvjeVFY';
let supabaseClient = null;

if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} else if (typeof createClient !== 'undefined') {
    // Fallback if some other loader is used
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
    console.error("Supabase script not loaded. Check internet or index.html.");
}

// DOM Elements
const pages = ['landing-page', 'map-page', 'traffic-report-page', 'pothole-report-page', 'echalan-page', 'admin-portal-page'];

// --- Navigation ---
function navigateTo(pageId) {
    // Hide all pages
    pages.forEach(id => {
        const el = document.getElementById(id);
        el.classList.add('hidden');
        el.classList.remove('active-page');
    });

    // Show target page
    const page = document.getElementById(pageId);
    page.classList.remove('hidden');
    page.classList.add('fade-in');

    // Toggle Menu Visibility
    const menuContainer = document.getElementById('menu-container');
    const adminBtn = document.getElementById('admin-btn-container');

    if (pageId === 'landing-page') {
        menuContainer.classList.add('hidden');
        adminBtn.classList.add('hidden');
    } else {
        menuContainer.classList.remove('hidden');
        adminBtn.classList.remove('hidden');
    }

    // Close sidebar if open
    document.getElementById('menu-container').classList.remove('open');

    // Specific Logic
    if (pageId === 'map-page') {
        initMap();
    }
}

function enterApp() {
    navigateTo('map-page');
}

// Sidebar logic
document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('menu-container').classList.add('open');
});

document.getElementById('close-menu-btn').addEventListener('click', () => {
    document.getElementById('menu-container').classList.remove('open');
});


// --- Map Logic ---
function initMap() {
    if (state.mapInitialized) return;

    // Centered on Bangalore/Karnataka
    state.map = L.map('map').setView([12.9716, 77.5946], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);

    // Generate 500 Mock Reports
    generateMockReports();

    state.mapInitialized = true;

    // Try to get user location immediately
    detectLocation();
}

function generateMockReports() {
    const minLat = 12.00, maxLat = 17.00; // Karnataka Approx
    const minLng = 75.00, maxLng = 78.00;

    for (let i = 0; i < 500; i++) {
        const lat = Math.random() * (maxLat - minLat) + minLat;
        const lng = Math.random() * (maxLng - minLng) + minLng;
        const type = Math.random() > 0.5 ? 'Traffic' : 'Pothole';

        addMarkerToMap(type, lat, lng, true);
    }
}

function addMarkerToMap(type, lat, lng, mock = false) {
    const color = type === 'Traffic' ? '#ef4444' : '#f97316'; // Red vs Orange
    const iconHtml = `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`;

    const customIcon = L.divIcon({
        className: 'custom-div-icon',
        html: iconHtml,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });

    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(state.map);

    if (mock) {
        marker.bindPopup(`<b>${type} Reported</b><br>Status: Investigating`);
    } else {
        marker.bindPopup(`<b>New ${type} Report</b><br>Source: User`).openPopup();
    }
}

function detectLocation() {
    const locInput = document.getElementById('current-location');
    locInput.value = "Locating...";

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            state.currentLocation = { lat: latitude, lng: longitude };

            if (state.map) {
                state.map.setView([latitude, longitude], 13);
                L.marker([latitude, longitude]).addTo(state.map)
                    .bindPopup("You are here").openPopup();

                // Generic "Loading..." while fetching address
                locInput.value = "Fetching Address...";

                // Reverse Geocode to get Name
                fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
                    .then(response => response.json())
                    .then(data => {
                        let name = data.display_name;
                        // Try to get shorter name if possible
                        if (data.address) {
                            const road = data.address.road || data.address.suburb || data.address.city_district;
                            const city = data.address.city || data.address.town || data.address.village || data.address.state_district;
                            if (road && city) name = `${road}, ${city}`;
                        }

                        // Store for comparison in calculateRoute
                        state.currentAddress = name;

                        locInput.value = name;
                        populateFormLocation(name);
                    })
                    .catch(err => {
                        console.error(err);
                        locInput.value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`; // Fallback
                        populateFormLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                    });
            }
        }, () => {
            locInput.value = "Bangalore (Default)";
            // Fallback
            state.currentLocation = { lat: 12.9716, lng: 77.5946 };
            populateFormLocation("Bangalore, Karnataka");
        });
    } else {
        locInput.value = "Geolocation not supported";
    }
}

function populateFormLocation(val) {
    if (document.getElementById('traffic-location')) document.getElementById('traffic-location').value = val;
    if (document.getElementById('pothole-location')) document.getElementById('pothole-location').value = val;
}

async function calculateRoute() {
    const destInput = document.getElementById('destination');
    const startInput = document.getElementById('current-location');
    const destQuery = destInput.value;
    const startQuery = startInput.value;

    if (!destQuery) {
        showNotification("Please enter a destination!");
        return;
    }

    if (!startQuery && !state.currentLocation) {
        showNotification("Please enter a start location.");
        return;
    }

    showNotification("Calculating route...");

    try {
        let startLat, startLng;

        // 1. Determine Start Coordinates
        // If the user hasn't changed the auto-detected text, use the cached GPS coords to save an API call
        if (state.currentLocation && state.currentAddress && startQuery === state.currentAddress) {
            startLat = state.currentLocation.lat;
            startLng = state.currentLocation.lng;
        } else {
            // Geocode manual start location
            // Bias towards Karnataka
            let sQuery = startQuery;
            if (!sQuery.toLowerCase().includes("karnataka")) sQuery += ", Karnataka";

            const startGeoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(sQuery)}`);
            const startGeoData = await startGeoResp.json();

            if (!startGeoData || startGeoData.length === 0) {
                showNotification("Start location not found.");
                return;
            }
            startLat = parseFloat(startGeoData[0].lat);
            startLng = parseFloat(startGeoData[0].lon);

            // Respect Nominatim Rate Limit (1 req/sec)
            await new Promise(r => setTimeout(r, 1100));
        }

        // 2. Geocode Destination
        let dQuery = destQuery;
        if (!dQuery.toLowerCase().includes("karnataka")) dQuery += ", Karnataka";

        const destGeoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(dQuery)}`);
        const destGeoData = await destGeoResp.json();

        if (!destGeoData || destGeoData.length === 0) {
            showNotification("Destination not found.");
            return;
        }

        const destLat = parseFloat(destGeoData[0].lat);
        const destLng = parseFloat(destGeoData[0].lon);

        // 3. Fetch Route from OSRM
        const routeResp = await fetch(`https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`);
        const routeData = await routeResp.json();

        if (routeData.code !== 'Ok' || !routeData.routes || routeData.routes.length === 0) {
            showNotification("Could not find a driving route.");
            return;
        }

        const routeGeoJSON = routeData.routes[0].geometry;

        // 4. Draw Route
        if (state.routeLayer) state.map.removeLayer(state.routeLayer);

        state.routeLayer = L.geoJSON(routeGeoJSON, {
            style: { color: '#4facfe', weight: 6, opacity: 0.8 }
        }).addTo(state.map);

        // Add markers
        // Clear old start marker if it differs from current GPS? 
        // For simplicity, we just add the dest marker. Start marker is usually "You are here" or we can add one.
        L.marker([startLat, startLng]).addTo(state.map).bindPopup("Start").openPopup();

        L.marker([destLat, destLng]).addTo(state.map)
            .bindPopup(`<b>Destination:</b><br>${destGeoData[0].display_name}`).openPopup();

        state.map.fitBounds(state.routeLayer.getBounds(), { padding: [50, 50] });

        const durationMins = Math.round(routeData.routes[0].duration / 60);
        showNotification(`Route Found! Est. Time: ${durationMins} mins`);

    } catch (err) {
        console.error(err);
        showNotification("Error calculating route. Check internet.");
    }
}

// --- Reporting Logic ---
function triggerCamera(inputId) {
    document.getElementById(inputId).click();
}

function previewImage(input, previewId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const div = document.getElementById(previewId);
            div.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        }
        reader.readAsDataURL(input.files[0]);
    }
}

async function submitReport(type) {
    // 1. Validate
    const loc = type === 'Traffic' ? document.getElementById('traffic-location').value : document.getElementById('pothole-location').value;

    if (!loc || loc.includes("Fetching")) {
        showNotification("Please wait for location detection.");
        // Try detecting again
        detectLocation();
        return;
    }

    // 2. Add to Map
    // We can't plot string address easily back to coords without geocoding again, 
    // but for this demo we assume we have user coords in state.currentLocation
    let lat = 0, lng = 0;
    if (state.currentLocation) {
        lat = state.currentLocation.lat;
        lng = state.currentLocation.lng;
        addMarkerToMap(type, lat, lng);
    }

    // 4. Copy Image to Clipboard
    const fileId = type === 'Traffic' ? 'traffic-file' : 'pothole-file';
    const fileInput = document.getElementById(fileId);
    let clipboardMsg = "Please attach photo manually.";

    if (fileInput.files && fileInput.files[0]) {
        try {
            // Write image to clipboard
            await navigator.clipboard.write([
                new ClipboardItem({
                    [fileInput.files[0].type]: fileInput.files[0]
                })
            ]);
            clipboardMsg = "Photo COPIED! Paste (Ctrl+V) in Gmail.";
        } catch (err) {
            console.error("Clipboard Error:", err);
            clipboardMsg = "Could not copy photo. Please attach manually.";
        }
    }

    // 5. Open Gmail for Report Submission
    const subject = `Report: ${type} at ${loc}`;
    const body = `To Traffic Authority,\n\nI would like to report ${type} at the following location:\n${loc}\n\nTimestamp: ${new Date().toLocaleString()}\n\n[PASTE YOUR PHOTO HERE (Ctrl+V)]\n\nRegards,\nConcerned Citizen`;

    // Gmail Compose URL
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=traffic.report@karnataka.gov.in&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    console.log(`Redirecting to Gmail for report submission...`);
    showNotification(clipboardMsg);

    // Open in new tab
    window.open(gmailUrl, '_blank');

    // Store pending Data
    pendingReportData = {
        type: type,
        location: loc, // string address
        timestamp: new Date().toLocaleTimeString(),
        lat: lat,
        lng: lng,
        hasLocation: (state.currentLocation !== null)
    };

    // Show Confirmation Modal
    setTimeout(() => {
        document.getElementById('confirmation-modal').classList.remove('hidden');
    }, 1000);
}

// Global variable for pending report
let pendingReportData = null;

function resolveReportSubmission(submitted) {
    document.getElementById('confirmation-modal').classList.add('hidden');

    if (submitted && pendingReportData) {
        // Add to Admin List (State)
        state.reports.push({
            type: pendingReportData.type,
            location: pendingReportData.location,
            timestamp: pendingReportData.timestamp
        });
        updateAdminReports();

        // Add to Map if we have coords
        if (pendingReportData.hasLocation) {
            addMarkerToMap(pendingReportData.type, pendingReportData.lat, pendingReportData.lng);
        }

        showNotification("Report Successfully Logged!");
    } else {
        showNotification("Report Cancelled (Not Saved).");
    }

    // Reset
    pendingReportData = null;

    // Navigate Back
    navigateTo('map-page');
}


// --- Autocomplete Logic ---
let debounceTimer;
const destInput = document.getElementById('destination');
const suggestionsList = document.getElementById('suggestions-list');

if (destInput) {
    destInput.addEventListener('input', function () {
        const query = this.value;
        clearTimeout(debounceTimer);

        if (!query || query.length < 3) {
            suggestionsList.classList.add('hidden');
            return;
        }

        debounceTimer = setTimeout(() => {
            fetchSuggestions(query);
        }, 500); // 500ms delay
    });

    // Close suggestions on click outside
    document.addEventListener('click', function (e) {
        if (e.target !== destInput && e.target !== suggestionsList) {
            suggestionsList.classList.add('hidden');
        }
    });
}

function fetchSuggestions(query) {
    console.log("Fetching suggestions for:", query);
    // Base Query
    let searchQuery = query;
    if (!searchQuery.toLowerCase().includes("karnataka")) {
        searchQuery += ", Karnataka";
    }

    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=in&limit=5`;

    // Bias results towards user's current location
    if (state.currentLocation) {
        // Create a 'viewbox' around the user (approx 50km radius)
        const lat = state.currentLocation.lat;
        const lng = state.currentLocation.lng;
        const offset = 0.5; // roughly 50km

        // viewbox = left,top,right,bottom (lon1,lat1,lon2,lat2)
        const viewbox = `${lng - offset},${lat + offset},${lng + offset},${lat - offset}`;
        url += `&viewbox=${viewbox}&bounded=0`; // bounded=0 means "prefer" but don't strictly exclude others
    }

    fetch(url)
        .then(response => response.json())
        .then(data => {
            suggestionsList.innerHTML = '';
            if (data.length > 0) {
                suggestionsList.classList.remove('hidden');
                data.forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'suggestion-item';
                    li.innerText = item.display_name;
                    li.onclick = () => {
                        document.getElementById('destination').value = item.display_name;
                        suggestionsList.classList.add('hidden');
                    };
                    suggestionsList.appendChild(li);
                });
            } else {
                suggestionsList.classList.add('hidden');
            }
        })
        .catch(err => console.error("Error fetching suggestions:", err));
}

// --- E-Challan Logic (DB Connection) ---
async function checkChallan() {
    const input = document.getElementById('echalan-input').value.trim();
    if (!input) {
        showNotification("Enter Vehicle Number.");
        return;
    }

    // Check if Supabase configured
    if (!supabaseClient || SUPABASE_URL.includes('YOUR_SUPABASE')) {
        showNotification("Supabase Keys Missing in app.js!");
        // Demo Fallback (To prevent app breaking during demo)
        // In real app, we return here.
        console.warn("Using mock response for demo.");
        const mock = { amount: 500, status: 'Pending', id: 'mock-1' };

        const resultDiv = document.getElementById('echalan-result');
        resultDiv.classList.remove('hidden');
        document.getElementById('challan-amount').innerText = mock.amount;
        document.getElementById('challan-status').innerText = mock.status;
        document.getElementById('challan-status').style.color = '#ef4444';
        resultDiv.dataset.id = mock.id;
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('challans')
            .select('*')
            .or(`plate.ilike.${input},owner.ilike.${input}`)
            .maybeSingle();

        if (error) throw error;

        const resultDiv = document.getElementById('echalan-result');
        resultDiv.classList.remove('hidden');

        if (data) {
            document.getElementById('challan-amount').innerText = data.amount;
            document.getElementById('challan-status').innerText = data.status;
            document.getElementById('challan-status').style.color = data.status === 'Pending' ? '#ef4444' : '#10b981';
            resultDiv.dataset.id = data.id;
        } else {
            document.getElementById('challan-amount').innerText = "0";
            document.getElementById('challan-status').innerText = "No Challans Found";
            document.getElementById('challan-status').style.color = '#10b981';
            delete resultDiv.dataset.id;
        }
    } catch (err) {
        console.error(err);
        showNotification("Error fetching challan (Check Console)");
    }
}

async function payChallan() {
    const resultDiv = document.getElementById('echalan-result');
    const id = resultDiv.dataset.id;
    if (!id) return;

    const currentStatus = document.getElementById('challan-status').innerText;
    if (currentStatus === 'Completed') {
        showNotification("Already Paid!");
        return;
    }

    if (!supabaseClient || SUPABASE_URL.includes('YOUR_SUPABASE')) {
        showNotification("Payment Successful (Demo)!");
        document.getElementById('challan-status').innerText = 'Completed';
        document.getElementById('challan-status').style.color = '#10b981';
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('challans')
            .update({ status: 'Completed' })
            .eq('id', id);

        if (error) throw error;

        showNotification(`Payment Successful! Receipt sent via Email.`);
        // Refresh UI
        document.getElementById('challan-status').innerText = 'Completed';
        document.getElementById('challan-status').style.color = '#10b981';
        updateAdminChallans();
    } catch (err) {
        console.error(err);
        showNotification("Payment Failed.");
    }
}

// --- Admin Logic ---
// --- Admin Logic ---
function requestAdminAccess() {
    // Simple client-side protection for demo
    const password = prompt("Enter Admin Password:");
    if (password === "admin123") {
        navigateTo('admin-portal-page');
        showNotification("Welcome Admin");
        updateAdminChallans(); // Load challans on entry
        updateAdminReports();  // Ensure local reports are visible
    } else if (password !== null) { // if not cancelled
        showNotification("Incorrect Password!");
    }
}

function switchAdminTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));

    if (tab === 'reports') {
        document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
        document.getElementById('admin-reports-tab').classList.remove('hidden');
    } else {
        document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
        document.getElementById('admin-challans-tab').classList.remove('hidden');
        updateAdminChallans();
    }
}

function updateAdminReports() {
    const list = document.getElementById('admin-reports-list');
    list.innerHTML = '';
    state.reports.forEach(r => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${r.type}</span> <small>${r.location}</small> <small>${r.timestamp}</small>`;
        list.appendChild(li);
    });
}

function adminAddReport() {
    const type = document.getElementById('admin-report-type').value;
    const coordsStr = document.getElementById('admin-report-coords').value;

    if (!coordsStr) return;
    const coords = coordsStr.split(',').map(n => parseFloat(n));
    if (coords.length !== 2) {
        showNotification("Invalid Format (Lat, Lng)");
        return;
    }

    addMarkerToMap(type, coords[0], coords[1]);
    showNotification("Admin Report Added");
}

async function updateAdminChallans() {
    const list = document.getElementById('admin-challans-list');
    list.innerHTML = '<li>Loading...</li>';

    if (!supabaseClient || SUPABASE_URL.includes('YOUR_SUPABASE')) {
        list.innerHTML = '<li>Supabase Not Configured</li>';
        return;
    }

    try {
        const { data, error } = await supabaseClient.from('challans').select('*');

        if (error) throw error;

        list.innerHTML = '';
        data.forEach(c => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${c.plate}</span>
                <span style="color: ${c.status === 'Pending' ? 'red' : 'green'}">${c.status}</span>
                <button onclick="toggleChallanStatus('${c.id}', '${c.status}')" style="padding:4px; margin-left:10px;">Toggle</button>
            `;
            list.appendChild(li);
        });
    } catch (err) {
        console.error(err);
        if (err.message && (err.message.includes("does not exist") || err.code === '42P01')) {
            list.innerHTML = '<li style="color:orange"><b>Setup Required:</b> Table "challans" not found.<br>Run the SQL script in Supabase!</li>';
        } else {
            list.innerHTML = `<li style="color:red">Error: ${err.message || 'Check console'}</li>`;
        }
    }
}

async function toggleChallanStatus(id, currentStatus) {
    if (!supabaseClient) return;

    const newStatus = currentStatus === 'Pending' ? 'Completed' : 'Pending';

    try {
        const { error } = await supabaseClient
            .from('challans')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) throw error;
        updateAdminChallans(); // Refresh
    } catch (err) {
        console.error(err);
        showNotification("Update Failed");
    }
}

// --- Utils ---
function showNotification(msg) {
    const container = document.getElementById('notification-container');
    const note = document.createElement('div');
    note.className = 'notification';
    note.innerText = msg;
    container.appendChild(note);

    setTimeout(() => {
        note.remove();
    }, 4000);
}


