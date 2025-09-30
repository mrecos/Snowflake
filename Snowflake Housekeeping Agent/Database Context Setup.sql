-- USE ROLE ACCOUNTADMIN;

-- 1. Create a dedicated database for platform-level analytics
CREATE DATABASE IF NOT EXISTS PLATFORM_ANALYTICS
  COMMENT = 'Database for platform-level analytics, governance models, and operational monitoring.';

-- 2. Create a schema within the new database to hold semantic models
CREATE SCHEMA IF NOT EXISTS PLATFORM_ANALYTICS.SEMANTIC_MODELS
  COMMENT = 'Schema to store semantic models and related views for Cortex Analyst.';

-- 3. Create a stage for the YAML specification files with a directory enabled
CREATE STAGE IF NOT EXISTS PLATFORM_ANALYTICS.SEMANTIC_MODELS.SEMANTIC_MODEL_SPECS
  DIRECTORY = ( ENABLE = true )
  COMMENT = 'Stage for storing semantic model YAML specification files.';


