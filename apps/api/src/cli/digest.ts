// Job da automação "follow-up esquecido".
//   npm run digest                    -> imprime o resumo de todos os vendedores
//   npm run digest -- --seller Ana    -> apenas uma pessoa
//   npm run digest -- --json          -> saída estruturada
//   npm run digest -- --send          -> envia o Markdown ao webhook (DIGEST_WEBHOOK_URL)
//
// Pensado para rodar por agendador (cron/GitHub Actions/Cloud Scheduler) toda manhã útil.

import 'dotenv/config';
import { createPool } from '../db/pool';
import { currentDate } from '../domain/dates';
import { buildDigest, renderDigestMarkdown } from '../domain/attention';
import { listOpportunities } from '../repo';

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(`--${name}`);
  const sellerIdx = args.indexOf('--seller');
  const seller = sellerIdx >= 0 ? args[sellerIdx + 1] : undefined;

  const pool = createPool();
  try {
    const today = currentDate();
    let digests = buildDigest(await listOpportunities(pool), today);
    if (seller) digests = digests.filter((d) => d.seller.toLowerCase() === seller.toLowerCase());

    if (flag('json')) {
      console.log(JSON.stringify({ asOf: today, sellers: digests }, null, 2));
      return;
    }
    const markdown = renderDigestMarkdown(digests, today);
    console.log(markdown);

    if (flag('send')) {
      const url = process.env.DIGEST_WEBHOOK_URL;
      if (!url) throw new Error('Defina DIGEST_WEBHOOK_URL para usar --send.');
      // Formato compatível com webhooks do Slack/Teams ({ text }).
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: markdown }),
      });
      if (!res.ok) throw new Error(`Webhook respondeu ${res.status}.`);
      console.log('Resumo enviado ao webhook.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
