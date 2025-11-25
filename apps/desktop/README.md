# AGI Workforce Desktop App

This is the desktop application for AGI Workforce, built with React, Vite, and Tauri.

## Project Structure

- `src/`: Main source code
  - `components/`: UI components
  - `stores/`: State management (Zustand)
  - `future_scope/`: **Archived Features**. This directory contains features that are currently disabled and excluded from the build (Employees, Marketplace, ROI Dashboard).
    - **Note**: Files in `future_scope` may contain broken relative imports. This is expected as they are archived.
- `src-tauri/`: Rust backend for Tauri

## Development

### Prerequisites

- Node.js
- Rust (for Tauri)

### Commands

- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run lint`: Run ESLint (excludes `future_scope`)
- `npm run typecheck`: Run TypeScript check (excludes `future_scope`)

## Linting

The `future_scope` directory is explicitly ignored in `.eslintignore` and `tsconfig.json` to prevent build errors from the archived features.
