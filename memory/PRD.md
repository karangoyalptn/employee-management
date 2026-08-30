# ApexForge Factory OS — Product Requirements

## Original problem statement
Create a JavaScript web app for a small factory with 200–300 employees. Leadership and managers should sign in with role-based access, manage employee details and absences, and manage tagged reports with controlled visibility. Supabase is intended for authentication, tables, and PDF/document storage. The first version should focus on a professional UI.

## Architecture decisions
- React frontend with the existing CRA/Craco starter and responsive CSS.
- UI-first implementation with local in-memory demo state for employee and report flows.
- Planned next phase: Supabase Auth/custom JWT flow, employee tables, report metadata, and Storage documents.
- Roles in scope: Admin, Leadership, Manager, Viewer.

## User personas
- Admin: manages people, roles, reports, and workspace settings.
- Leadership: reviews workforce, salary, reports, and executive activity.
- Manager: manages shift employees and absence records.
- Viewer: read-only directory and permitted reports.

## Core requirements (static)
- Login is the first screen.
- Overview dashboard shows active workforce, attendance, night shift, reports, and recent activity.
- Employees can be searched, filtered by shift, added, edited, and deleted.
- Employee records include required name, gender, shift, salary, plus role and absence details.
- Reports support a flexible category/tag, naming guidance, access labels, and repository browsing.
- All interactive and critical UI elements have unique `data-testid` attributes.

## Implemented

### 2024-06-03
- Replaced starter screen with ApexForge Factory OS login and responsive manager workspace.
- Added dark industrial visual system using Barlow Condensed, DM Sans, red/blue/green/amber operational accents, and factory imagery.
- Added Overview, Employees, and Reports navigation views.
- Added local demo flows for login, search, shift filtering, employee add/edit/delete, report upload affordance, and report tag filtering.
- Verified production build succeeds with `yarn build`.
- Frontend testing agent verified login, dashboard, directory, employee CRUD interactions, reports, and mobile overflow behavior.

## Prioritized backlog

### P0 — Next tasks
- Connect Supabase Auth and persist role-aware sessions.
- Create Supabase employee and absence tables with row-level security.
- Create Supabase Storage bucket and report metadata table with access policies.

### P1 — Planned improvements
- Add employee photo and Aadhar/PAN upload with secure document previews.
- Add detailed employee profile page with absence history and shift timeline.
- Add report upload validation for filename/date rules and real file downloads.

### P2 — Later enhancements
- Add attendance trend exports and leadership summaries.
- Add audit log for changes to salary, documents, and permissions.
- Add configurable report tags and role permission editor.

## Current status
The UI is complete and interactive for review. Supabase, JWT persistence, and backend APIs are not wired yet because the user requested UI-only work for this first version.