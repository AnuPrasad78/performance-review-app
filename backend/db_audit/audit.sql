-- ============================================================================
-- PERFORMANCE REVIEW APP — DATABASE AUDIT (Stage 1 of 3)
--
-- Purpose: ground the enterprise schema design in reality. Do NOT assume the
-- database matches any earlier DDL reconstruction; run this and read the
-- output before drafting any Alembic migration.
--
-- Safe to run: reads catalog views and table data only. No writes.
-- Run once, save the output, and paste it back for Stage 2 review:
--
--   psql -U hrdesk_user -d <database_name> \
--        -f schema_and_data_audit.sql \
--        -o db_audit_result.txt
--
-- (Copy this file anywhere convenient, e.g. backend/db_audit/, before running.)
-- ============================================================================

\echo '=== 00. SERVER CONTEXT ==='
SELECT current_database() AS database
     , current_user      AS connected_as
     , current_setting('TimeZone') AS timezone
     , version()         AS postgres_version;

\echo '=== 01. SCHEMA INVENTORY: every table in the public schema ==='
SELECT tablename
  FROM pg_tables
 WHERE schemaname = 'public'
 ORDER BY tablename;

\echo '=== 02. COLUMNS: types, nullability, defaults, identity ==='
SELECT c.table_name
     , c.ordinal_position
     , c.column_name
     , c.data_type
     , COALESCE(c.character_maximum_length::text, '') AS char_len
     , c.is_nullable
     , COALESCE(c.column_default, '')                 AS column_default
  FROM information_schema.columns c
 WHERE c.table_schema = 'public'
 ORDER BY c.table_name, c.ordinal_position;

\echo '=== 03. CONSTRAINTS: full definitions (PK / FK / UNIQUE / CHECK) ==='
SELECT n.nspname                     AS schema_name
     , con.conrelid::regclass        AS table_name
     , con.conname
     , pg_get_constraintdef(con.oid) AS constraint_definition
  FROM pg_constraint con
  JOIN pg_namespace  n   ON n.oid = con.connamespace
 WHERE n.nspname = 'public'
 ORDER BY con.conrelid::regclass::text, con.conname;

\echo '=== 04. INDEXES ==='
SELECT tablename
     , indexname
     , indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
 ORDER BY tablename, indexname;

\echo '=== 05. ROW COUNTS ==='
SELECT 'departments' AS table_name, count(*) AS row_count FROM departments
UNION ALL
SELECT 'employees',      count(*) FROM employees
UNION ALL
SELECT 'evaluations',    count(*) FROM evaluations;

\echo '=== 06. DATA AUDIT: evaluation status vocabulary in use ==='
SELECT status, count(*) AS rows
  FROM evaluations
 GROUP BY status
 ORDER BY rows DESC;

\echo '=== 07. DATA AUDIT: review years in use ==='
SELECT review_year, count(*) AS rows
  FROM evaluations
 GROUP BY review_year
 ORDER BY review_year;

\echo '=== 08. DATA AUDIT: distinct employee (self) ratings in use ==='
SELECT self_rating, count(*) AS rows
  FROM evaluations
 GROUP BY self_rating
 ORDER BY self_rating NULLS FIRST;

\echo '=== 09. DATA AUDIT: distinct manager ratings in use ==='
SELECT manager_rating, count(*) AS rows
  FROM evaluations
 GROUP BY manager_rating
 ORDER BY manager_rating NULLS FIRST;

\echo '=== 10. DATA AUDIT: duplicate evaluations for same employee + year ==='
SELECT employee_id, review_year, count(*) AS rows
  FROM evaluations
 GROUP BY employee_id, review_year
  HAVING count(*) > 1;

\echo '=== 11. DATA AUDIT: employees with NULL email ==='
SELECT count(*) AS null_email_rows
  FROM employees
 WHERE email IS NULL;

\echo '=== 12. DATA AUDIT: duplicate employee emails (case-insensitive) ==='
SELECT lower(email) AS email, count(*) AS rows
  FROM employees
 WHERE email IS NOT NULL
 GROUP BY lower(email)
  HAVING count(*) > 1
 ORDER BY rows DESC;

\echo '=== 13. DATA AUDIT: orphan employees (department_id has no matching department) ==='
SELECT e.employee_id, e.employee_name, e.department_id
  FROM employees e
  LEFT JOIN departments d ON d.department_id = e.department_id
 WHERE e.department_id IS NOT NULL
   AND d.department_id IS NULL;

\echo '=== 14. DATA AUDIT: orphan evaluations (employee_id has no matching employee) ==='
SELECT ev.evaluation_id, ev.employee_id
  FROM evaluations ev
  LEFT JOIN employees e ON e.employee_id = ev.employee_id
 WHERE e.employee_id IS NULL;

\echo '=== 15. DATA AUDIT: employees without a department assignment ==='
SELECT count(*) AS no_department_rows
  FROM employees
 WHERE department_id IS NULL;

\echo '=== 16. DATA AUDIT: employment_status vocabulary in use ==='
SELECT employment_status, count(*) AS rows
  FROM employees
 GROUP BY employment_status
 ORDER BY rows DESC;

\echo '=== 17. DATA AUDIT: manager name references (sample) ==='
SELECT reporting_manager, count(*) AS rows
  FROM employees
 GROUP BY reporting_manager
 ORDER BY rows DESC
 LIMIT 25;

\echo '=== 18. SECURITY: table grants (who can do what) ==='
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
 ORDER BY table_name, grantee, privilege_type;

\echo '=== 19. SECURITY: extensions installed ==='
SELECT extname, extversion
  FROM pg_extension
 ORDER BY extname;

\echo '=== AUDIT COMPLETE — save this output for the Stage 2 schema review ==='