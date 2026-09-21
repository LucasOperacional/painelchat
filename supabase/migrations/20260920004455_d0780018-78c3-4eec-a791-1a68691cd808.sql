GRANT USAGE, CREATE ON SCHEMA public TO sandbox_exec;
GRANT ALL ON ALL TABLES IN SCHEMA public TO sandbox_exec;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO sandbox_exec;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO sandbox_exec;
GRANT USAGE ON SCHEMA auth TO sandbox_exec;
GRANT SELECT, REFERENCES ON auth.users TO sandbox_exec;