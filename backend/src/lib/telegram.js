const BOT_TOKEN = process.env.BOT_TOKEN;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendTelegram(chatId, text, options = {}) {
  if (!BOT_TOKEN) {
    console.warn('[telegram] BOT_TOKEN not set, skipping send');
    return null;
  }
  try {
    const res = await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...options }),
    });
    if (!res.ok) {
      console.error('[telegram] send failed:', res.status, await res.text());
    }
    return res;
  } catch (err) {
    console.error('[telegram] send error:', err.message);
    return null;
  }
}
