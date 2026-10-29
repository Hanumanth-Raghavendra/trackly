import { describe, expect, it } from 'vitest';
import { loadConfig, NATIVE_APP_ORIGINS } from '../../src/config.js';

describe('loadConfig', () => {
  it('always allows the mobile app, even when the web origins are overridden', () => {
    const cfg = loadConfig({ CORS_ALLOWED_ORIGINS: ' https://trackly-hr.vercel.app ,, ' });
    expect(cfg.corsOrigins).toEqual(['https://trackly-hr.vercel.app', ...NATIVE_APP_ORIGINS]);
  });

  it('does not list an origin twice', () => {
    const cfg = loadConfig({ CORS_ALLOWED_ORIGINS: 'https://localhost,http://localhost:5173' });
    expect(cfg.corsOrigins).toEqual(['https://localhost', 'http://localhost:5173', 'capacitor://localhost']);
  });

  it('fails fast on a JWT secret that is too short', () => {
    expect(() => loadConfig({ JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});
