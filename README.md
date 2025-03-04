# Christian Art Agent

This is a monorepo for the Christian Art Agent project, which includes a backend Cloudflare Worker and a frontend Cloudflare Pages application.

## Project Structure

```
christian-art-agent/
├── apps/
│   ├── backend/       # Cloudflare Worker
│   │   ├── src/       # Worker source code
│   │   └── test/      # Worker tests
│   │
│   └── frontend/      # Cloudflare Pages app
│       └── src/       # React frontend code
│
└── package.json       # Root package.json for workspace management
```

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm (v8+)

### Installation

Install dependencies for all workspaces:

```bash
npm install
```

### Development

Run the backend Worker locally:

```bash
npm run dev:backend
```

Run the frontend application locally:

```bash
npm run dev:frontend
```

### Building

Build the backend Worker:

```bash
npm run build:backend
```

Build the frontend application:

```bash
npm run build:frontend
```

### Deployment

Deploy the backend Worker to Cloudflare:

```bash
npm run deploy:backend
```

Deploy the frontend application to Cloudflare Pages:

```bash
npm run deploy:frontend
```

## License

[Your License Here]