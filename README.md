# Timetable Schedular & Manager

An Automated College Timetable Management System built to streamline academic scheduling. The application handles complex constraints, allows staggered year-wise slot configurations, supports drag/click swapping with real-time collision checking, and implements multi-role control (Admin vs. Department Users).

---

## 🛠️ Architecture & Tech Stack

The project is split into a client-server architecture:

- **Backend**: Node.js, Express.js, MongoDB (Mongoose ODM).
  - Custom scheduling algorithm engine in `backend/engine/scheduler.js`.
  - Staggered slots, constraint checking, and multi-department separation.
- **Frontend**: React, Vite, Vanilla CSS.
  - Component-driven UI with sleek animations, interactive timetable grid, drag-and-drop/click swap workflows, and searchable elements.

---

## 🚀 Key Features

- **Automated Generation Wizard**: Auto-generates timetables while respecting complex constraints (faculty busy slots, laboratory assignments, classroom capacities).
- **Interactive Timetable Grid & Swap Mode**: Easily rearrange schedules. Clicking on a slot enters **Swap Mode**, which highlights potential conflict-free slots in a distinct orange visual accent and validates collisions using the backend constraints validator.
- **Multi-Role Scoping**:
  - **Admin**: Has institutional control. Can add/edit/delete records for all departments, configure settings, and filter/view timetables by department.
  - **Department User**: Scoped strictly to their own department (e.g., CSE, ECE) for editing, but can view other departments' schedules.
- **Staggered Slot Configurations**: Configure active classes, break periods, and lunch periods on a year-by-year basis.
- **Import/Export Utility**: Import subjects and faculty details quickly using Excel spreadsheets (.xlsx, .xls) and CSV templates.
- **Audit Logging**: Fully registers administrative actions for traceability and error-checking.

---

## 💻 Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [MongoDB](https://www.mongodb.com/try/download/community) (running locally or a MongoDB Atlas URI)

---

### 1. Backend Setup

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env` file in the `backend` directory (a fallback is automatically used if left blank):
   ```env
   MONGODB_URI=mongodb://localhost:27017/timetable_db
   PORT=5050
   ```

4. Run the Backend:
   - For development (with auto-reload):
     ```bash
     npm run dev
     ```
   - For production:
     ```bash
     npm start
     ```

Upon starting, the backend will auto-seed:
- Default Departments (`CSE`, `ECE`, `Placement`, `Maths`, `CSE-CYS`)
- Default Admin account:
  - **Username**: `admin`
  - **Password**: `admin123`
- Default Department User accounts:
  - **Username**: `<department_code_lowercase>_admin` (e.g., `cse_admin`, `ece_admin`)
  - **Password**: `dept123`

---

### 2. Frontend Setup

1. Navigate to the `frontend` directory:
   ```bash
   cd ../frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the Frontend:
   - For development:
     ```bash
     npm run dev
     ```
   - Build for production:
     ```bash
     npm run build
     ```

*Note: The frontend API base URL is configured in [api.js](frontend/src/utils/api.js) and defaults to `http://localhost:5050/api`.*

---

## 📂 Project Directory Structure

```text
├── backend/
│   ├── engine/           # Scheduling & Swap validation algorithms
│   ├── middleware/       # JWT Token authentication & role protection
│   ├── models/           # Mongoose schemas (User, Class, Subject, Room, etc.)
│   ├── routes/           # Express endpoint controllers
│   ├── db.js             # MongoDB connection setup
│   └── server.js         # Entry point & DB seed routines
│
├── frontend/
│   ├── src/
│   │   ├── components/   # Reusable UI elements (Modal, Toast, SearchableSelect)
│   │   ├── context/      # React AuthContext provider
│   │   ├── pages/        # Views (TimetableView, Classes, Subjects, Faculty, etc.)
│   │   └── utils/        # Axios API configurations
│   ├── index.html        # Entry index
│   └── vite.config.js    # Vite configuration
│
└── README.md             # Project documentation
```
