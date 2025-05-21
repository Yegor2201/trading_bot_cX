#!/bin/bash

# Initialize the database
echo "Initializing database..."
python -c "import database; database.initialize_db(); print('Database initialized successfully')"

# Start the server with Uvicorn
echo "Starting server..."
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
