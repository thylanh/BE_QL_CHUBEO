import { INestApplication } from '@nestjs/common';

const initApp = (app: INestApplication) => {
  const { APP_PREFIX = '/api', FE_URL = '*' } = process.env;
  app.setGlobalPrefix(APP_PREFIX);
  app.enableCors({
    origin: FE_URL === '*' ? true : FE_URL.split(',').map((url) => url.trim()),
  });
  app.enableShutdownHooks();
  return app;
};
export { initApp };
