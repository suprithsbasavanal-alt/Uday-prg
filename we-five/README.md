# We Five - Karnataka Road Safety App

A real-time road safety capability application for Karnataka, featuring live traffic/pothole reporting, navigation, and e-challan management.

## Features
- **Live Navigation**: Route calculation with OSRM & Nominatim.
- **Reporting**: Report Potholes/Traffic with location & photos.
- **E-Challan**: Supabase-backed system to check and pay fines.
- **Admin Portal**: Secure portal (Pass: `admin123`) to manage data.
- **Data**: Pre-seeded with 500 mock reports and 500 mock challans.

## Quick Start
1. **Run the Server**:
   You can use the provided script to start the server easily:
   ```bash
   ./start_server.sh
   ```
   Or manually:
   ```bash
   python3 -m http.server 8080
   ```

2. **Access the App**:
   - **This Computer**: [http://localhost:8080](http://localhost:8080)
   - **Other Devices (Same Wi-Fi)**: `http://10.211.56.227:8080`
   
   *Note: For mobile access, ensure your phone and computer are on the same Wi-Fi network.*

## Supabase Setup (Database)
To make the E-Challan feature work, you must set up your Supabase project:

1. **Create Table `challans`**:
   - `id` (int8, Primary Key)
   - `plate` (text)
   - `owner` (text)
   - `amount` (int8)
   - `status` (text)

2. **Seed Data**:
   - Copy the contents of `seed_challans.sql`.
   - Paste it into the **Supabase SQL Editor** and click **Run**.
   - This adds 500 mock vehicle records (e.g., `KA-01-AB-1234`).

## Usage
- **Admin Access**: Click the shield icon (Top Right). Password: `admin123`.
- **Search**: Type a destination (e.g. "Mysore Palace") inside Karnataka.
- **Report**: Click the Menu (Top Left) -> Report Traffic.
