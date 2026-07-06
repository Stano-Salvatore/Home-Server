export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrap } = await import("@/server/bootstrap");
    await bootstrap();
  }
}
