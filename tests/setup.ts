/**
 * Test setup, loaded before every test file.
 *
 * Bun loads `.env` automatically, so the operator secret is present when the
 * suite runs. The routes are correct to demand it - that is the whole point
 * of the credential model - but the suite exercises them without a
 * credential, the way the Python suite opts into development mode in
 * `tests/conftest.py`.
 *
 * Removing the secret here keeps "no credential configured outside production"
 * as the behaviour under test, and keeps a stray `.env` from turning the
 * whole suite red.
 */
delete process.env.INTERNAL_API_KEY;
delete process.env.REFEREE_INTERNAL_KEY;
