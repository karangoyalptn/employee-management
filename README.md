# Roles and Permissions

This document outlines the four user roles in the Employee Management System and their respective permissions.

---

## Role Hierarchy

The system has 4 roles with decreasing levels of access:

1. **Admin** - Full system access
2. **Leadership** - Management access (no team role management)
3. **Manager** - Supervisor access (read salary restrictions)
4. **Viewer** - Read-only access

---

## Detailed Permissions

### 1. 👑 Admin (Highest Access)

**Can do everything:**

#### Team Management
- ✅ View Team & Roles section
- ✅ Add new team members
- ✅ Change anyone's role
- ✅ Reset anyone's password
- ✅ Remove team members

#### Employees
- ✅ View all employees
- ✅ Add new employees
- ✅ Edit employee details
- ✅ Delete employees
- ✅ View salary information
- ✅ Upload employee photos & ID documents
- ✅ Manage absence history (add/delete)

#### Reports
- ✅ View all reports
- ✅ Upload reports
- ✅ Download reports
- ✅ Delete reports
- ✅ Manage tags (create/rename/delete)

#### Attendance
- ✅ View attendance records (by month/by day)
- ✅ Filter by shift/employee
- ✅ View absence history

#### Account
- ✅ Change own password
- ✅ Sign out

---

### 2. 🎯 Leadership (Management Level)

**Almost full access, no team management:**

#### Team Management
- ❌ Cannot access Team & Roles section

#### Employees
- ✅ View all employees
- ✅ Add new employees
- ✅ Edit employee details
- ✅ Delete employees
- ✅ View salary information
- ✅ Upload employee photos & ID documents
- ✅ Manage absence history (add/delete)

#### Reports
- ✅ View all reports
- ✅ Upload reports
- ✅ Download reports
- ✅ Delete reports
- ✅ Manage tags (create/rename/delete)

#### Attendance
- ✅ View attendance records (by month/by day)
- ✅ Filter by shift/employee
- ✅ View absence history

#### Account
- ✅ Change own password
- ✅ Sign out

---

### 3. 👔 Manager (Supervisor Level)

**Can manage employees but limited on reports:**

#### Team Management
- ❌ Cannot access Team & Roles section

#### Employees
- ✅ View all employees
- ✅ Add new employees
- ✅ Edit employee details
- ❌ Cannot delete employees
- ❌ Cannot view salary information
- ✅ Upload employee photos & ID documents
- ✅ Manage absence history (add/delete)

#### Reports
- ✅ View all reports
- ✅ Download reports
- ❌ Cannot upload reports
- ❌ Cannot delete reports
- ❌ Cannot manage tags

#### Attendance
- ✅ View attendance records (by month/by day)
- ✅ Filter by shift/employee
- ✅ View absence history

#### Account
- ✅ Change own password
- ✅ Sign out

---

### 4. 👁️ Viewer (Read-Only)

**Can only view, no modifications:**

#### Team Management
- ❌ Cannot access Team & Roles section

#### Employees
- ✅ View all employees
- ❌ Cannot add employees
- ❌ Cannot edit employees
- ❌ Cannot delete employees
- ❌ Cannot view salary information
- ❌ Cannot upload photos or documents
- ❌ Cannot manage absence history

#### Reports
- ✅ View all reports
- ✅ Download reports
- ❌ Cannot upload reports
- ❌ Cannot delete reports
- ❌ Cannot manage tags

#### Attendance
- ✅ View attendance records (by month/by day)
- ✅ Filter by shift/employee
- ✅ View absence history (read-only)

#### Account
- ✅ Change own password
- ✅ Sign out

---

## Quick Comparison Matrix

| Feature | Admin | Leadership | Manager | Viewer |
|---------|:-----:|:----------:|:-------:|:------:|
| **Team Management** |
| Manage Team & Roles | ✅ | ❌ | ❌ | ❌ |
| Add Team Members | ✅ | ❌ | ❌ | ❌ |
| Change Roles | ✅ | ❌ | ❌ | ❌ |
| Reset Passwords | ✅ | ❌ | ❌ | ❌ |
| Remove Members | ✅ | ❌ | ❌ | ❌ |
| **Employee Management** |
| View Employees | ✅ | ✅ | ✅ | ✅ |
| Add Employees | ✅ | ✅ | ✅ | ❌ |
| Edit Employees | ✅ | ✅ | ✅ | ❌ |
| Delete Employees | ✅ | ✅ | ❌ | ❌ |
| View Salary | ✅ | ✅ | ❌ | ❌ |
| Upload Photos/Docs | ✅ | ✅ | ✅ | ❌ |
| Manage Absences | ✅ | ✅ | ✅ | ❌ |
| **Reports** |
| View Reports | ✅ | ✅ | ✅ | ✅ |
| Download Reports | ✅ | ✅ | ✅ | ✅ |
| Upload Reports | ✅ | ✅ | ❌ | ❌ |
| Delete Reports | ✅ | ✅ | ❌ | ❌ |
| Manage Tags | ✅ | ✅ | ❌ | ❌ |
| **Attendance** |
| View Attendance | ✅ | ✅ | ✅ | ✅ |
| View Absence History | ✅ | ✅ | ✅ | ✅ (read-only) |
| Filter by Shift/Employee | ✅ | ✅ | ✅ | ✅ |

---

## Recommended Use Cases

| Role | Recommended For |
|------|-----------------|
| **Admin** | Company owner, HR head, System administrator |
| **Leadership** | Department heads, Senior managers, Operations head |
| **Manager** | Team leads, Shift supervisors, Floor managers |
| **Viewer** | Accountants (read-only), Auditors, External consultants |

---

## Permission Functions (Technical Reference)

The following JavaScript functions determine access control:

```javascript
const canManageEmployees = (role) => ["admin", "leadership", "manager"].includes(role);
const canDeleteEmployees = (role) => ["admin", "leadership"].includes(role);
const canUploadReports = (role) => ["admin", "leadership"].includes(role);
const canSeeSalary = (role) => ["admin", "leadership"].includes(role);
```

**Special Rules:**
- Only **Admin** can access the "Team & Roles" section
- Only **Admin** and **Leadership** can see salary information
- Only **Admin** and **Leadership** can manage reports (upload/delete)
- **Manager** can add/edit employees but cannot delete them
- **Viewer** has complete read-only access to all sections

---

## Notes

- All roles can change their own password
- All roles can view their profile information
- Session management is automatic - expired sessions redirect to login
- All actions are scoped to the workspace (company) the user belongs to
