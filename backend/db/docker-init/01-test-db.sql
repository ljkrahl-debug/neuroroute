-- The test suite runs against its own database so it can truncate freely
-- without wiping development data. Created once, when the container is first
-- initialised.
CREATE DATABASE neuroroute_test OWNER neuroroute;
