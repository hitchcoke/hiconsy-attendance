import { createApp } from './app';
async function main() {
  const { app } = await createApp();
  await app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1');
  console.log(`Hiconsy API: http://127.0.0.1:${process.env.PORT || 3000}`);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
