process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars!';
// Always isolate tests — never inherit Atlas/prod URI from .env (avoids dropDatabase wiping real data)
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/starmedia-crm-test';
process.env.ALLOWED_DOMAINS = 'starmediainfluencer.com';
