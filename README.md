# Chat Room

A modern, real-time chat application with room-based messaging. Built with a static frontend on Vercel and a Cloudflare Worker backend with D1 database.

🌐 **Live Demo:** [https://chat.badry.asia/](https://chat.badry.asia/)

## ✨ Features

- 🏠 **Room Management**
  - Create public or private chat rooms
  - Join rooms via room name or invite code
  - Password protection for private rooms
  - Room owner controls (regenerate invite code, change password)

- 💬 **Real-time Messaging**
  - Auto-refresh messages every 3.5 seconds
  - Message history with timestamps
  - User identification and member tracking

- 🎨 **Modern UI**
  - Apple-inspired dark mode design
  - Responsive layout for mobile and desktop
  - Smooth animations and transitions
  - Frosted glass effects (backdrop blur)

- 🔒 **Security**
  - Member tokens for authentication
  - Private room password protection
  - Invite code system for easy sharing

## 🏗️ Architecture

### Frontend (`/web`)
- **Platform:** Vercel (Static Hosting)
- **Tech:** Vanilla HTML/CSS/JavaScript
- **Features:**
  - No build step required
  - Session persistence via localStorage
  - Responsive design with mobile-first approach

### Backend (`/worker`)
- **Platform:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Tech:** TypeScript
- **Features:**
  - RESTful API endpoints
  - CORS support
  - Room expiration (7 days inactive)
  - Input validation and sanitization

## 📁 Project Structure

```
chatroom-cf-vercel/
├── web/                    # Frontend (Vercel)
│   ├── index.html         # Main application
│   └── package.json       # Vercel deployment config
├── worker/                 # Backend (Cloudflare)
│   ├── src/
│   │   └── index.ts       # Worker entry point
│   ├── migrations/        # D1 database migrations
│   │   ├── 0001_init.sql
│   │   └── 0002_rooms.sql
│   └── package.json       # Wrangler config
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account with Workers and D1 access
- Vercel account (optional, for frontend deployment)

### Backend Setup (Cloudflare Worker)

1. **Install dependencies:**
   ```bash
   cd worker
   npm install
   ```

2. **Create D1 database:**
   ```bash
   npm run db:create
   ```

3. **Run migrations:**
   ```bash
   # Local development
   npm run db:migrate
   
   # Production
   npm run db:migrate:remote
   ```

4. **Configure `wrangler.toml`:**
   - Update database binding name if needed
   - Set your Cloudflare account ID

5. **Deploy:**
   ```bash
   npm run deploy
   ```

### Frontend Setup (Vercel)

1. **Install dependencies:**
   ```bash
   cd web
   npm install
   ```

2. **Update API URL:**
   - Edit `index.html` and update `DEFAULT_API_URL` to your Cloudflare Worker URL
   - Or users can set it manually in the UI (if connection panel is enabled)

3. **Deploy:**
   ```bash
   npm run deploy
   ```

   Or connect your GitHub repo to Vercel for automatic deployments.

### Local Development

**Frontend:**
```bash
cd web
npm run dev
# Serves on http://localhost:3000 (or similar)
```

**Backend:**
```bash
cd worker
npx wrangler dev
# Worker runs on http://localhost:8787
```

## 📡 API Endpoints

### Rooms

- `GET /api/rooms` - List all public rooms
- `POST /api/rooms/create` - Create a new room
- `POST /api/rooms/join` - Join a room
- `POST /api/rooms/:roomId/regenerate-invite` - Regenerate invite code (owner only)
- `POST /api/rooms/:roomId/regenerate-password` - Change room password (owner only)

### Messages

- `GET /api/messages?roomId={id}` - Get messages for a room
- `POST /api/messages` - Send a message

## 🎨 UI Features

- **Dark Mode:** Full Apple-inspired dark theme
- **Responsive:** Works seamlessly on mobile, tablet, and desktop
- **Smooth Animations:** Message fade-in effects
- **Toast Notifications:** Error and success feedback
- **Auto-scroll:** Messages area auto-scrolls to latest
- **Session Persistence:** Remembers your name and room session

## 🔧 Configuration

### Environment Variables

**Cloudflare Worker:**
- D1 database binding (configured in `wrangler.toml`)

**Frontend:**
- Default API URL can be set in `index.html` or via localStorage

### Limits

- Max name length: 40 characters
- Max room name: 60 characters
- Max message length: 500 characters
- Room expiration: 7 days of inactivity

## 📝 License

This project is open source and available for personal and commercial use.

## 🙏 Acknowledgments

- Built with [Cloudflare Workers](https://workers.cloudflare.com/) and [D1](https://developers.cloudflare.com/d1/)
- Frontend hosted on [Vercel](https://vercel.com/)
- UI inspired by Apple's Human Interface Guidelines

---

**Made with ❤️ using Cloudflare + Vercel**
