# Thought Box API

A FastAPI project for managing boxes and thoughts, using PostgreSQL and Docker Compose.

## Features

- Create and list boxes
- Add thoughts to boxes
- Retrieve thoughts from boxes

## Setup

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Build and start services:
   ```bash
   docker compose up --build
   ```
3. The API will be available at `http://localhost:8000`.

## API Endpoints

### Health Check

- `GET /`
  - Returns API status.

### Boxes

- `GET /boxes`

  - List all boxes.
  - Response: `{ "boxes": [{ "id": int, "name": str, "created_at": str }] }`

- `POST /add/box/{box_name}`
  - Create a new box.
  - Path parameter: `box_name` (string)
  - Response: `{ "message": "Box '{box_name}' created successfully!" }`

### Thoughts

- `POST /add/thought/{box_id}`

  - Add a thought to a box.
  - Path parameter: `box_id` (int)
  - Query parameter: `thought` (string)
  - Response: `{ "message": "Thought added to box with ID '{box_id}'." }`

- `GET /get/thoughts/{box_id}`
  - Get all thoughts for a box.
  - Path parameter: `box_id` (int)
  - Response: `{ "thoughts": [{ "id": int, "text": str, "created_at": str }] }`

## Database

- Uses PostgreSQL, initialized with `init_db.sql`.
- Data is persisted in the `data/` folder.

## Development

- Edit `.env` for environment variables.
- API code is in `main.py`.

## License

MIT
