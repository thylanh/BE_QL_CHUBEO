import { INestApplication } from '@nestjs/common';

const initApp = (app: INestApplication) => {
  const { APP_PREFIX = '/api' } = process.env;
  app.setGlobalPrefix(APP_PREFIX);
  app.enableShutdownHooks();
  return app;
};
export { initApp };
