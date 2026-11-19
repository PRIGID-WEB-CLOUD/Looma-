import { db, channelCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptCredential } from "./services/credentialVault";

async function getChannelCredentials(channel: string): Promise<Record<string, string>> {
  const [row] = await db.select().from(channelCredentialsTable).where(eq(channelCredentialsTable.channel, channel)).limit(1);
  const stored = (row?.data as Record<string, string>) || {};
  return Object.fromEntries(Object.entries(stored).map(([key, value]) => [key, decryptCredential(value as any)]));
}

async function run() {
  const comm = await getChannelCredentials("commerce");
  const fb = await getChannelCredentials("facebook");
  const mb = await getChannelCredentials("meta_business");
  const catalogId = (comm["catalog_id"] || fb["catalog_id"] || mb["catalog_id"] || "").trim();
  const token = (comm["page_access_token"] || fb["page_access_token"] || mb["page_access_token"] || mb["master_access_token"] || fb["access_token"] || comm["access_token"] || "").trim();

  const r1 = await fetch(`https://graph.facebook.com/v21.0/${catalogId}/products?fields=id,name,retailer_id&access_token=${token}`);
  const d1 = (await r1.json()) as any;
  console.log("Products:");
  console.log(d1.data?.map((p: any) => `${p.retailer_id} - ${p.id}`));
}

run().catch(console.error).finally(() => process.exit(0));
