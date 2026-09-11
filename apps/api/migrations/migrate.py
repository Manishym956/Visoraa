"""
Run the Supabase migration via direct PostgreSQL connection.
Usage: python apps/api/migrations/migrate.py
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env", override=False)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env")
    sys.exit(1)

# Derive project ref from URL: https://PROJECT_REF.supabase.co
project_ref = SUPABASE_URL.split("//")[1].split(".")[0]

# Supabase transaction mode pooler (port 6543) accepts JWT as password
# Direct connection (port 5432) also works and supports DDL
conn_str = (
    f"postgresql://postgres.{project_ref}:{SUPABASE_KEY}"
    f"@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    f"?sslmode=require"
)

print(f"Connecting to project: {project_ref}")

try:
    import psycopg2
except ImportError:
    print("ERROR: run  pip install psycopg2-binary  first")
    sys.exit(1)

sql_file = Path(__file__).parent / "001_init.sql"
statements = [
    s.strip() for s in sql_file.read_text().split(";")
    if s.strip() and not s.strip().startswith("--")
]

try:
    conn = psycopg2.connect(conn_str)
    conn.autocommit = True
    cur = conn.cursor()
    for i, stmt in enumerate(statements, 1):
        if not stmt:
            continue
        print(f"  [{i}/{len(statements)}] {stmt[:60].replace(chr(10), ' ')}...")
        try:
            cur.execute(stmt)
        except psycopg2.errors.DuplicateTable:
            print("    → already exists, skipping")
        except psycopg2.errors.DuplicateObject:
            print("    → already exists, skipping")
        except Exception as e:
            print(f"    → WARN: {e}")
    cur.close()
    conn.close()
    print("\n✓ Migration complete.")
except Exception as e:
    print(f"\nERROR connecting: {e}")
    print(
        "\nIf connection refused, run the SQL manually:\n"
        "  → Supabase dashboard → SQL Editor → paste contents of 001_init.sql → Run"
    )
    sys.exit(1)
