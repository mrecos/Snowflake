# your_script.py

from snowflake.snowpark import Session

def main(session: Session) -> str:
    """
    Simple test entry point for a Snowpark-Python stored procedure.
    Runs a basic SELECT and returns the greeting text.
    """
    # Run a trivial SQL query
    df = session.sql("SELECT 'Hello, Snowflake!' AS GREETING")
    # Pull the result out of the DataFrame
    greeting = df.collect()[0]['GREETING']
    return greeting
