"""
WSGI entry point for Gunicorn.
This file allows importing from either 'app' or 'backend.app' module paths.
"""
import sys
import os

# Add parent directory to path if we're in the backend directory
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)

if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Import the Flask app
try:
    # Try importing from current directory first (when running from backend/)
    from app import app
except ImportError:
    # Fall back to importing from parent (when running from root/)
    from backend.app import app

if __name__ == "__main__":
    app.run()
