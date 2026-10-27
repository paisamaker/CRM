import mongoose from 'mongoose';

/**
 * Drop only the isolated local test database. Refuses Atlas / shared prod URIs.
 */
export async function safeDropTestDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI || mongoose.connection.client?.options?.hosts?.toString() || '';
  const dbName = mongoose.connection.name;
  const looksLikeAtlas = /mongodb\.net|mongodb\+srv|atlas/i.test(uri) || /mongodb\.net/i.test(String(mongoose.connection.host));
  const looksLikeSharedProd = !/test/i.test(dbName || '');

  if (looksLikeAtlas || looksLikeSharedProd) {
    throw new Error(
      `Refusing dropDatabase: connected to non-test DB "${dbName}". Tests must use mongodb://127.0.0.1:27017/starmedia-crm-test`
    );
  }
  await mongoose.connection.dropDatabase();
}
