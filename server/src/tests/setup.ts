process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars!';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/starmedia-crm-test';
process.env.ALLOWED_DOMAINS = 'starmediainfluencer.com';
