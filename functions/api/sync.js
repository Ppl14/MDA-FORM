// ============================================================================
// CLOUDFLARE PAGES FUNCTION: /api/sync (Zero-Egress Cloudflare D1 SQL Backend)
// Automatically runs on Cloudflare Pages when D1 database is bound as `DB`
// ============================================================================
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const companyId = url.searchParams.get('company_id') || 'tripflow_hq_prod';
  const checkTsOnly = url.searchParams.get('ts_only') === '1';

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'Bind a Cloudflare D1 database named DB in Cloudflare Pages Settings -> Functions.' }), {
      status: 503,
      headers: corsHeaders
    });
  }

  try {
    if (request.method === 'GET') {
      if (checkTsOnly) {
        const row = await env.DB.prepare('SELECT updated_at FROM tripflow_state WHERE company_id = ?').bind(companyId).first();
        return new Response(JSON.stringify({ updated_at: row ? row.updated_at : null }), { headers: corsHeaders });
      }
      const row = await env.DB.prepare('SELECT payload, updated_by, updated_at FROM tripflow_state WHERE company_id = ?').bind(companyId).first();
      if (!row) {
        return new Response(JSON.stringify({ payload: null }), { headers: corsHeaders });
      }
      return new Response(JSON.stringify({
        payload: JSON.parse(row.payload),
        updated_by: row.updated_by,
        updated_at: row.updated_at
      }), { headers: corsHeaders });
    }

    if (request.method === 'PUT' || request.method === 'POST') {
      const body = await request.json();
      const payloadStr = JSON.stringify(body.payload || {});
      const updatedBy = body.updated_by || 'Admin';
      const updatedAt = body.updated_at || new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO tripflow_state (company_id, payload, updated_by, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(company_id) DO UPDATE SET
           payload = excluded.payload,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`
      ).bind(companyId, payloadStr, updatedBy, updatedAt).run();

      return new Response(JSON.stringify({ ok: true, updated_at: updatedAt }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
