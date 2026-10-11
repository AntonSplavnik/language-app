import { loadEnvFile, parseConfig } from "../../src/config";

export function testDatabaseUrl(): string {
  loadEnvFile();
  return parseConfig(process.env).TEST_DATABASE_URL;
}
