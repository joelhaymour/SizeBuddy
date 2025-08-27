export async function withShopifyRateLimit(fn, { retries = 3, baseDelayMs = 500 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      const is429 = e?.response?.code === 429 || e?.response?.status === 429;
      if (!is429 || attempt >= retries) throw e;
      const wait = baseDelayMs * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, wait));
      attempt++;
    }
  }
}


