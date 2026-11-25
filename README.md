# Sri Laxmi Narasimha (SLN) Bakery - Premium Ordering Platform

A modern, full-stack online ordering web platform for Sri Laxmi Narasimha (SLN) Bakery built with React, Vite, Tailwind CSS, Supabase, and Cashfree Payments.

## Key Features

- **Product Catalog & Categorization**: Browse fresh baked goods, sweets, hot snacks, cakes, and artisanal breads with filtering and search.
- **Cart & Dynamic Pricing**: Real-time cart calculations, packaging charges, and distance-based delivery fee calculations.
- **Delivery & Takeaway Modes**:
  - Store takeaway / pickup scheduling.
  - Delivery radius calculation with OpenStreetMap / Nominatim geocoding.
- **Secure Multi-Gateway Payments**:
  - Cash on Delivery (COD) / Pay at Pickup.
  - Cashfree Payment Gateway integration via Supabase Edge Functions with strict exact-paise validation, idempotent checkout, and concurrency row locking.
- **Customer Account Management**:
  - Supabase Phone/Email OTP Authentication.
  - Saved delivery addresses with a single-default address constraint.
  - Order history tracking and detailed receipts.
- **Admin Management Portal**:
  - Live orders management with status update RPCs (`received`, `preparing`, `out_for_delivery`, `ready_for_pickup`, `completed`, `cancelled`).
  - Product catalog management (create, update, toggle availability, delete).
  - Category management (add, edit, list categories).
  - Product image upload directly into Supabase Storage bucket (`product-images`).

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Canvas Confetti.
- **Backend / Database**: Supabase (PostgreSQL), Row Level Security (RLS), custom Stored Procedures (RPCs).
- **Edge Functions**: Deno TypeScript Supabase Edge Function for Cashfree PG order initialization (`create-cashfree-order`).
- **Build & Package Tooling**: Vite 8, pnpm.

## Project Structure

```
.
├── src/
│   ├── components/         # Modals, Navbar, Footer, Order Receipt, Profile, Checkout, Admin
│   ├── lib/
│   │   ├── geocoding.ts    # Delivery location & distance calculation
│   │   └── supabase.ts     # Supabase client & database service helpers
│   ├── App.tsx             # Main application layout and view controller
│   ├── data.ts             # Initial product/category catalog & bakery constants
│   ├── index.css           # Global Tailwind CSS styles
│   └── main.tsx            # React application entrypoint
├── supabase/
│   ├── functions/
│   │   ├── _shared/        # Shared Cashfree utilities, types, and precision amount validation
│   │   └── create-cashfree-order/ # Cashfree checkout session Edge Function
│   ├── migrations/         # PostgreSQL database schemas, RLS policies, and RPCs
│   ├── config.toml         # Supabase local/project configuration
│   └── seed.sql            # Initial database seed data
├── .env.example            # Environment variable template
└── package.json
```

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- pnpm

### 2. Environment Setup
Copy `.env.example` to `.env.local` and populate the necessary keys:
```bash
cp .env.example .env.local
```

Required variables:
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase project anonymous key
- `CASHFREE_APP_ID`: Cashfree payment gateway client ID
- `CASHFREE_SECRET_KEY`: Cashfree payment gateway secret key
- `CASHFREE_ENV`: `SANDBOX` or `PRODUCTION`

### 3. Install Dependencies & Run
```bash
pnpm install
pnpm dev
```

Build for production:
```bash
pnpm build
```
