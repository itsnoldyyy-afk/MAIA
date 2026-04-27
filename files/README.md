# MAIA Backend — Setup Guide

## Prerequisites
- Node.js 18+
- MySQL 8.0+
- npm

## 1. Install dependencies
```bash
cd maia-backend
npm install
```

## 2. Set up the database
Open MySQL and run the schema:
```bash
mysql -u root -p < src/config/schema.sql
```
This creates the `maia_db` database and all tables.  
Default admin account: phone `09000000000`, password `Admin@DCPO2026`

## 3. Configure environment
```bash
cp .env.example .env
# Edit .env with your MySQL credentials, JWT secret, etc.
```

## 4. Run the server
```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```
Server runs on **http://localhost:3000**

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register (multipart/form-data, include `id_photo`) |
| POST | `/api/auth/verify-otp` | Verify phone with OTP |
| POST | `/api/auth/login` | Login → returns JWT token |

### Cases
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/cases` | Reporter | File new missing person report |
| GET | `/api/cases` | Any | List cases (filtered by status, district) |
| GET | `/api/cases/:id` | Any | Get case details + sightings + logs |
| PATCH | `/api/cases/:id/verify` | Admin | Approve or reject a case |
| PATCH | `/api/cases/:id/status` | Auth | Update case status (found, closed) |
| GET | `/api/cases/stats` | Admin | Dashboard statistics |

### Sightings
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/cases/:id/sightings` | Public | Submit a sighting |
| GET | `/api/cases/:id/sightings` | Any | List sightings for a case |
| PATCH | `/api/sightings/:id/confirm` | Admin | Confirm a sighting |

### Alerts
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/alerts/disseminate/:caseId` | Admin | Post to Facebook + send SMS |
| GET | `/api/alerts/notifications/:caseId` | Auth | Get notification history |

---

## Example: Filing a report
```bash
curl -X POST http://localhost:3000/api/cases \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "full_name=Juan Dela Cruz" \
  -F "age=42" \
  -F "gender=male" \
  -F "last_seen_place=Poblacion, Davao City" \
  -F "last_seen_date=2026-04-13" \
  -F "description=Wearing blue polo shirt, black pants" \
  -F "photo=@/path/to/photo.jpg"
```

## Next steps
- **Face recognition**: See `face-recognition` branch — integrates DeepFace via Python microservice
- **Facebook integration**: Set `FB_PAGE_ACCESS_TOKEN` and `FB_PAGE_ID` in `.env`
- **SMS**: Sign up at semaphore.co and set `SEMAPHORE_API_KEY`
- **Production deploy**: Use PM2 + Nginx on Ubuntu VPS
