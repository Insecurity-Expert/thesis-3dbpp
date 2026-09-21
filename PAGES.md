# STACKR Page & Interface Documentation

Welcome to the official frontend interface documentation for **STACKR** (Structural Three-dimensional Adaptive Constraint-aware pacKing, Route-aware). This guide details the structure, functionality, routes, and interactive components of the web application.

---

## 🧭 Application Routing Architecture

The client application utilizes `react-router-dom` for navigation, enforcing route-guarding based on user authentication status:

*   **`/login`**: The entry page for user authentication.
*   **`/register`**: Allows new accounts to be registered with designated roles.
*   **`/app`** *(Protected)*: The main interactive application shell. Unauthenticated users are automatically redirected to `/login`.

---

## 🔒 Authentication Pages

Both authentication pages are styled using a premium, clean **glassmorphic container** design with the STACKR monogram block-stacked logo.

### 1. Login Page (`/login`)
*   **Purpose**: Validates registered credentials.
*   **Key Fields**: Email Address, Password.
*   **Design Details**:
    *   Responsive central card layout with HSL-based theme integration.
    *   Direct links to the registration page.
    *   Interactive validation feedback for incorrect credentials.

### 2. Registration Page (`/register`)
*   **Purpose**: Creates new user records stored in the database.
*   **Key Fields**: Full Name, Email Address, Password, Profile Role selection.
*   **Profile Roles**:
    *   **Researcher**: Focused on analytical bounds, composite scores, and algorithm tuning.
    *   **Logistics Manager**: Focused on operational constraints, load-compliance, and LIFO routing.

---

## 💻 Main Application Workspace (`/app`)

The main application workspace is structured around a **sticky global header** and an **interactive tabbed panel layout**.

### 🌟 Global Header
The header provides branding, context, and profile utilities:
*   **STACKR Logo**: Stacked monogram logo representing bin layers.
*   **Benchmark Badge**: Dynamic chip reflecting the currently loaded benchmark instance (e.g., OR-Library Benchmark: `BR0`).
*   **Theme Toggle**: Seamless light/dark mode switcher utilizing a custom HSL token scheme.
*   **User Avatar Dropdown**: Displays initials of the logged-in user. Clicking opens a dropdown showing user details, role (e.g., Researcher), and a **Log out** utility.

---

### 📥 1. Logistics Tab
The control center of STACKR, enabling configuration of physical bounds, algorithm variables, and items cargo.

#### 📏 Container (Bin) Config
*   **Dimensions Input**: Interactive length ($L$), depth ($D$), and height ($H$) inputs in centimeters.
*   **Max Weight Load**: Defines the threshold limit in kilograms.
*   **Real-time Isometric Graphic**: Displays a dynamic wireframe preview of current dimensions alongside summary load text.

#### ⚙️ Algorithm Settings
*   **Hybrid Strategy badges**: Choose the optimization method:
    *   `Sequential`: Solves instances in strict sequence.
    *   `Embedded`: Runs embedded local-search steps.
    *   `Repair-based`: Actively repairs violations during pack iterations.
*   **Wolf Pack Size**: Sets the agent population count for the Grey Wolf Optimizer.
*   **Max Iterations**: Controls the search limits of the heuristic.

#### ⚖️ Constraint Policies
*   **Fragility (LBS-based)**: Toggles fragility calculation rules.
*   **Allow Item Rotation**: Toggles whether items can be rotated in 3D to fit.
*   **LIFO Constraint**: Ensures items are packed based on delivery order.

#### 📦 Item / Box Log Editor
*   **Stat Cards**: Dynamic totals reflecting standard/fragile/heavy item distributions and overall weight metrics.
*   **Add Item Form**: Manual input for custom dimensions, weight, destination stop index, cargo type (Standard, Fragile, Heavy), and quantity.
*   **CSV Import**: Directly parse and load bulk cargo lists formatting `ID, Stop, L, H, D, Qty, Type, Weight`.
*   **Box Log Table**: Interactive grid to review loaded boxes, showing custom category tags and single-click removal (`✕`).

---

### 📊 2. Results Tab
Displays detailed mathematical analysis of the packing results, including charts and export options.

*   **Live Loop Progress**: Shows current iteration counts and progress bars during active runs.
*   **Metric Stat Chips**:
    *   **Space Utilization**: Percent-volume occupied (NAB metric).
    *   **Optimality Gap**: Relative margin vs. the theoretical lower bound.
    *   **Dissipation $D(X)$**: Measures distribution balance across bins.
    *   **Runtime**: Execution time in seconds.
*   **Axis Utilization**: Progress breakdown along individual coordinate axes (X-axis, Y-axis, Z-axis).
*   **Convergence Curve**: SVG chart mapping Bins Used vs. Iterations.
*   **Actions**:
    *   **Export CSV**: Download standard comma-separated details of placed boxes.
    *   **Export Report**: Formats the results tab into a clean print-ready layout.

---

### 👁️ 3. Visualization Tab
A WebGL viewport powered by Three.js displaying the calculated 3D layout.

*   **Viewport Canvas**: Fully interactive 3D rendering allowing click-and-drag rotation, scroll-to-zoom, and right-click panning.
*   **Rotate View Presets**: Fast camera snapping buttons (`Front`, `Side`, `Top`, `3D`).
*   **Filter Panel**:
    *   **Cargo Types**: Checkboxes to toggle visibility of Standard, Fragile, and Heavy items.
    *   **Stop Selection**: Filter item rendering by delivery destination index (`All`, `Stop 1`, `Stop 2`, etc.).
*   **Item Selection Detail**: Clicking a physical box highlights it in the viewport and populates a sidebar detailing its exact positioning coordinate ($x, y, z$) and dimensions.

---

### 📜 4. Run History Tab
Tracks and retrieves user-specific execution logs.

*   **Historical Log Table**: Lists strategy, benchmark name, packed item count, space utilization percent, runtime, and total bins used.
*   **Queries & Filters**: Select logs matching specific optimization strategies or search by benchmark label.
*   **JSON Exporter**: Save entire historical run logs local to the profile as a structured JSON file.
