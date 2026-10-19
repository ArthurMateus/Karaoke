-- Runs once, the first time the postgres volume is created.
-- A separate database for automated tests so they never touch your data.
CREATE DATABASE karaoke_test;
