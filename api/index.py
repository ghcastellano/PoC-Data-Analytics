"""
Vercel Serverless Function — wraps the FastAPI app.
All /api/* routes are handled by this single function.
"""
import sys
import os

# Add backend directory to path so we can import main
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from main import app
